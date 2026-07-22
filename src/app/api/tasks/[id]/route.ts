import { NextRequest, NextResponse } from "next/server"
import { requireSession } from "@/lib/auth"
import { getTask } from "@/lib/task-queue"

export const runtime = "nodejs"

interface Params {
  params: Promise<{ id: string }>
}

/**
 * GET /api/tasks/[id]
 * 查询任务状态（前端轮询用）
 */
export async function GET(_request: NextRequest, { params }: Params) {
  await requireSession()

  try {
    const { id } = await params
    const task = await getTask(id)

    if (!task) {
      return NextResponse.json({ error: "任务不存在" }, { status: 404 })
    }

    return NextResponse.json({
      success: true,
      task: {
        id: task.id,
        type: task.type,
        status: task.status,
        progress: task.progress,
        error_message: task.error_message,
        result: task.result,
        created_at: task.created_at,
        started_at: task.started_at,
        completed_at: task.completed_at,
      },
    })
  } catch (error) {
    console.error("[Task Status] 查询任务失败:", error)
    return NextResponse.json(
      { error: "查询任务失败", detail: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}
