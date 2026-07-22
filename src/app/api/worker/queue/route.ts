import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { presignUrl } from "@/lib/storage"
import { cleanupStaleTasks } from "@/lib/task-queue"

export const runtime = "nodejs"

// API Token 认证
function verifyToken(request: NextRequest): boolean {
  const token = request.headers.get("x-worker-token")
  const expectedToken = process.env.WORKER_API_TOKEN

  if (!expectedToken) {
    console.error("[Worker Queue] WORKER_API_TOKEN 环境变量未配置")
    return false
  }
  if (!token) {
    console.error("[Worker Queue] X-Worker-Token 请求头缺失")
    return false
  }
  return token.trim() === expectedToken.trim()
}

/**
 * GET /api/worker/queue
 * 统一任务队列接口 - Worker 拉取待处理任务
 * 认证：X-Worker-Token 请求头
 * 
 * Query params:
 * - types: 逗号分隔的任务类型，如 "parse_file,generate_questions"
 * - limit: 每次拉取数量，默认 10
 */
export async function GET(request: NextRequest) {
  if (!verifyToken(request)) {
    return NextResponse.json({ error: "未授权：无效的 Token" }, { status: 401 })
  }

  try {
    // 先清理超时任务
    await cleanupStaleTasks()

    const { searchParams } = new URL(request.url)
    const typesParam = searchParams.get("types")
    const limit = Math.min(parseInt(searchParams.get("limit") || "10"), 50)

    const client = db()

    // 构建查询
    let query = client
      .from("background_tasks")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(limit)

    // 按类型过滤
    if (typesParam) {
      const types = typesParam.split(",").map(t => t.trim()).filter(Boolean)
      if (types.length > 0) {
        query = query.in("type", types)
      }
    }

    const { data: tasks, error } = await query

    if (error) {
      throw new Error(error.message)
    }

    // 为每个任务准备额外信息（如文件URL）
    const enrichedTasks = await Promise.all(
      (tasks || []).map(async (task) => {
        const enriched: Record<string, unknown> = {
          id: task.id,
          type: task.type,
          resource_type: task.resource_type,
          resource_id: task.resource_id,
          payload: task.payload,
          created_at: task.created_at,
        }

        // 对于需要下载文件的任务，生成预签名URL
        if (task.type === "parse_file" || task.type === "import_roster") {
          const fileKey = task.payload?.file_key as string
          if (fileKey) {
            try {
              enriched.file_url = await presignUrl(fileKey)
            } catch {
              enriched.file_url = ""
            }
          }
        }

        // 对于题库生成任务，附带材料文本
        if (task.type === "generate_questions") {
          const materialId = task.resource_id
          const { data: material } = await client
            .from("materials")
            .select("content_text, title")
            .eq("id", materialId)
            .single()

          if (material) {
            enriched.material_text = material.content_text
            enriched.material_title = material.title
          }
        }

        // 对于提纲生成任务，附带材料文本
        if (task.type === "generate_outline") {
          const materialId = task.resource_id
          const { data: material } = await client
            .from("materials")
            .select("content_text, title")
            .eq("id", materialId)
            .single()

          if (material) {
            enriched.material_text = material.content_text
            enriched.material_title = material.title
          }
        }

        return enriched
      })
    )

    // 将任务标记为 processing
    if (enrichedTasks.length > 0) {
      const taskIds = enrichedTasks.map(t => t.id as string)
      await client
        .from("background_tasks")
        .update({
          status: "processing",
          started_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .in("id", taskIds)
    }

    return NextResponse.json({
      success: true,
      count: enrichedTasks.length,
      tasks: enrichedTasks,
    })
  } catch (error) {
    console.error("[Worker Queue] 获取任务队列失败:", error)
    return NextResponse.json(
      { error: "获取任务队列失败", detail: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}
