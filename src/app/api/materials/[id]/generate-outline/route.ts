import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireSession } from "@/lib/auth"
import { createTask } from "@/lib/task-queue"

export const runtime = "nodejs"

interface Params {
  params: Promise<{ id: string }>
}

/**
 * POST /api/materials/[id]/generate-outline
 * 提交提纲生成任务到后台队列
 */
export async function POST(request: NextRequest, { params }: Params) {
  const session = await requireSession()
  const materialId = (await params).id
  const body = await request.json()
  const { audience = "worker" } = body

  if (!["worker", "trainer"].includes(audience)) {
    return NextResponse.json({ error: "audience 必须是 worker 或 trainer" }, { status: 400 })
  }

  const client = db()

  // 获取材料信息
  const { data: material, error: matError } = await client
    .from("materials")
    .select("*")
    .eq("id", materialId)
    .single()

  if (matError || !material) {
    return NextResponse.json({ error: "材料不存在" }, { status: 404 })
  }

  // 检查材料是否已解析
  if (material.status !== "parsed" || !material.content_text) {
    return NextResponse.json({ error: "材料尚未解析完成，请先解析材料" }, { status: 400 })
  }

  // 创建后台任务
  const taskId = await createTask({
    type: "generate_outline",
    resource_type: "materials",
    resource_id: materialId,
    payload: {
      audience,
    },
  })

  return NextResponse.json({
    success: true,
    task_id: taskId,
    message: "提纲生成任务已提交，请等待 Worker 处理",
  })
}
