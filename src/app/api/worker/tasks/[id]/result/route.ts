import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getTask, updateTaskStatus, type TaskStatus, type TaskResult } from "@/lib/task-queue"

export const runtime = "nodejs"
export const maxDuration = 60

// API Token 认证
function verifyToken(request: NextRequest): boolean {
  const token = request.headers.get("x-worker-token")
  const expectedToken = process.env.WORKER_API_TOKEN

  if (!expectedToken) {
    console.error("[Worker Result] WORKER_API_TOKEN 环境变量未配置")
    return false
  }
  if (!token) {
    console.error("[Worker Result] X-Worker-Token 请求头缺失")
    return false
  }
  return token.trim() === expectedToken.trim()
}

interface Params {
  params: Promise<{ id: string }>
}

/**
 * POST /api/worker/tasks/[id]/result
 * Worker 回写任务结果
 * 
 * Body:
 * - status: "completed" | "failed"
 * - result: 任务结果（根据任务类型不同结构不同）
 * - error_message: 失败时的错误信息
 * - progress: 进度更新（可选）
 */
export async function POST(request: NextRequest, { params }: Params) {
  if (!verifyToken(request)) {
    return NextResponse.json({ error: "未授权：无效的 Token" }, { status: 401 })
  }

  try {
    const { id: taskId } = await params
    const body = await request.json()
    const { status, result, error_message, progress } = body as {
      status?: TaskStatus
      result?: TaskResult
      error_message?: string
      progress?: { current?: number; total?: number; message?: string }
    }

    if (!status || !["completed", "failed", "processing"].includes(status)) {
      return NextResponse.json(
        { error: "status 必须是 completed / failed / processing" },
        { status: 400 }
      )
    }

    // 获取任务信息
    const task = await getTask(taskId)
    if (!task) {
      return NextResponse.json({ error: "任务不存在" }, { status: 404 })
    }

    // 更新进度（如果提供）
    if (progress && status === "processing") {
      await updateTaskStatus(taskId, "processing", { progress })
      return NextResponse.json({ success: true, message: "进度已更新" })
    }

    // 处理完成/失败
    if (status === "completed") {
      await handleTaskCompleted(task, result || {})
    } else if (status === "failed") {
      await handleTaskFailed(task, error_message || "未知错误")
    }

    return NextResponse.json({
      success: true,
      message: status === "completed" ? "任务已完成" : "失败已记录",
    })
  } catch (error) {
    console.error("[Worker Result] 回写任务结果失败:", error)
    return NextResponse.json(
      { error: "回写任务结果失败", detail: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}

/**
 * 处理任务完成 - 根据任务类型写入不同表
 */
async function handleTaskCompleted(
  task: { id: string; type: string; resource_type: string; resource_id: string; payload: Record<string, unknown> | null },
  result: TaskResult
) {
  const client = db()

  switch (task.type) {
    case "parse_file": {
      // 更新材料表
      const wordCount = result.word_count ?? result.text_content?.replace(/\s/g, "").length ?? 0
      await client
        .from("materials")
        .update({
          status: "parsed",
          content_text: result.text_content,
          parse_source: "external",
          error_message: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", task.resource_id)

      await updateTaskStatus(task.id, "completed", { result })
      break
    }

    case "generate_questions": {
      // 写入题目到题库
      const bankId = task.payload?.bank_id as string
      if (!bankId) {
        throw new Error("任务缺少 bank_id")
      }

      const questions = result.questions || []
      if (questions.length > 0) {
        // 批量插入题目
        const questionRows = questions.map((q, idx) => ({
          bank_id: bankId,
          type: q.type,
          content: q.content,
          options: q.options,
          answer: q.answer,
          explanation: q.explanation || "",
          order_no: idx + 1,
        }))

        // 分批插入（每批50条）
        for (let i = 0; i < questionRows.length; i += 50) {
          const batch = questionRows.slice(i, i + 50)
          const { error } = await client.from("questions").insert(batch)
          if (error) {
            console.error("[Worker Result] 插入题目失败:", error.message)
          }
        }

        // 更新题库题目数量
        await client
          .from("question_banks")
          .update({
            total_count: questions.length,
            status: "published",
            updated_at: new Date().toISOString(),
          })
          .eq("id", bankId)
      }

      // 更新材料状态（如果有 generating 状态）
      await client
        .from("materials")
        .update({
          status: "parsed",
          updated_at: new Date().toISOString(),
        })
        .eq("id", task.resource_id)

      await updateTaskStatus(task.id, "completed", {
        result: { ...result, total_generated: questions.length },
      })
      break
    }

    case "generate_outline": {
      // 写入提纲
      const audience = task.payload?.audience as "worker" | "trainer"
      if (!audience) {
        throw new Error("任务缺少 audience")
      }

      const materialId = task.resource_id

      // 删除旧提纲
      await client
        .from("outlines")
        .delete()
        .eq("material_id", materialId)
        .eq("audience", audience)

      // 插入新提纲
      const { data: newOutline, error } = await client
        .from("outlines")
        .insert({
          material_id: materialId,
          audience,
          title: `${audience === "worker" ? "工人版" : "培训师版"}培训提纲`,
          content_md: result.content_md || "",
          status: "published",
        })
        .select("id")
        .single()

      if (error) {
        throw new Error(`写入提纲失败: ${error.message}`)
      }

      await updateTaskStatus(task.id, "completed", {
        result: { ...result, outline_id: newOutline?.id },
      })
      break
    }

    case "import_roster": {
      // 花名册导入结果已在 Worker 端直接写入 workers 表
      // 这里只更新任务状态
      await updateTaskStatus(task.id, "completed", { result })
      break
    }

    default:
      throw new Error(`未知的任务类型: ${task.type}`)
  }
}

/**
 * 处理任务失败
 */
async function handleTaskFailed(
  task: { id: string; type: string; resource_type: string; resource_id: string },
  errorMessage: string
) {
  const client = db()

  // 根据任务类型更新相关资源状态
  switch (task.type) {
    case "parse_file":
      await client
        .from("materials")
        .update({
          status: "failed",
          error_message: errorMessage,
          updated_at: new Date().toISOString(),
        })
        .eq("id", task.resource_id)
      break

    case "generate_questions":
      // 题库状态保持 draft 或删除
      break

    case "generate_outline":
      // 提纲未写入，无需处理
      break

    case "import_roster":
      // 导入失败，无需额外处理
      break
  }

  await updateTaskStatus(task.id, "failed", { error_message: errorMessage })
}
