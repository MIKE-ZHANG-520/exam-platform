import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireSession } from "@/lib/auth"
import { createTask } from "@/lib/task-queue"

export const runtime = "nodejs"

interface Params {
  params: Promise<{ id: string }>
}

/**
 * POST /api/materials/[id]/generate-questions
 * 提交题库生成任务到后台队列
 */
export async function POST(request: NextRequest, { params }: Params) {
  const session = await requireSession()
  const materialId = (await params).id
  const body = await request.json()
  const { difficulty = "medium", count = 40, note = "" } = body

  if (!["easy", "medium"].includes(difficulty)) {
    return NextResponse.json({ error: "difficulty 必须是 easy 或 medium" }, { status: 400 })
  }
  if (!Number.isInteger(count) || count < 1 || count > 200) {
    return NextResponse.json({ error: "count 必须是 1-200 的整数" }, { status: 400 })
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

  // 创建题库记录
  const bankId = crypto.randomUUID()
  const { error: bankError } = await client
    .from("question_banks")
    .insert({
      id: bankId,
      name: `${material.title} - ${difficulty === "easy" ? "基础题" : "进阶题"}`,
      difficulty,
      total_count: 0,
      status: "draft",
      owner_id: session.id,
      source_type: "material",
      source_id: materialId,
      note,
    })

  if (bankError) {
    return NextResponse.json({ error: "创建题库失败", detail: bankError.message }, { status: 500 })
  }

  // 创建后台任务
  const taskId = await createTask({
    type: "generate_questions",
    resource_type: "materials",
    resource_id: materialId,
    payload: {
      difficulty,
      count,
      bank_id: bankId,
      note,
    },
  })

  return NextResponse.json({
    success: true,
    task_id: taskId,
    bank_id: bankId,
    message: "题库生成任务已提交，请等待 Worker 处理",
  })
}
