/**
 * 后台任务队列工具库
 * 提供创建、查询、更新后台任务的统一接口
 */

import { db } from "@/lib/db"

export type TaskType = "parse_file" | "generate_questions" | "generate_outline" | "import_roster"
export type TaskStatus = "pending" | "processing" | "completed" | "failed"
export type ResourceType = "materials" | "question_banks" | "outlines" | "workers"

export interface TaskPayload {
  // parse_file
  file_url?: string
  file_type?: string
  // generate_questions
  difficulty?: "easy" | "medium"
  bank_id?: string
  note?: string
  // generate_outline
  audience?: "worker" | "trainer"
  // import_roster
  file_key?: string
  project_id?: string
  // common
  [key: string]: unknown
}

export interface TaskProgress {
  current?: number
  total?: number
  message?: string
  batch?: number
  totalBatches?: number
}

export interface TaskResult {
  // parse_file
  text_content?: string
  page_count?: number
  word_count?: number
  // generate_questions
  questions?: Array<{
    type: string
    content: string
    options: Array<{ key: string; text: string }>
    answer: string[]
    explanation?: string
    risk_level?: string
    tag?: string
  }>
  total_generated?: number
  // generate_outline
  content_md?: string
  // import_roster
  imported_count?: number
  skipped_count?: number
  errors?: string[]
  // common
  [key: string]: unknown
}

/**
 * 创建后台任务
 */
export async function createTask(params: {
  type: TaskType
  resource_type: ResourceType
  resource_id: string
  payload?: TaskPayload
}): Promise<string> {
  const client = db()

  // 检查是否已有同类型的 pending/processing 任务
  const { data: existing } = await client
    .from("background_tasks")
    .select("id")
    .eq("type", params.type)
    .eq("resource_type", params.resource_type)
    .eq("resource_id", params.resource_id)
    .in("status", ["pending", "processing"])
    .limit(1)

  if (existing && existing.length > 0) {
    // 已有任务在进行中，返回已有任务ID
    return existing[0].id
  }

  const { data, error } = await client
    .from("background_tasks")
    .insert({
      type: params.type,
      resource_type: params.resource_type,
      resource_id: params.resource_id,
      payload: params.payload || {},
      status: "pending",
    })
    .select("id")
    .single()

  if (error) {
    throw new Error(`创建任务失败: ${error.message}`)
  }

  return data.id
}

/**
 * 获取任务详情
 */
export async function getTask(taskId: string) {
  const client = db()
  const { data, error } = await client
    .from("background_tasks")
    .select("*")
    .eq("id", taskId)
    .single()

  if (error) {
    throw new Error(`查询任务失败: ${error.message}`)
  }

  return data
}

/**
 * 获取资源关联的最新任务
 */
export async function getLatestTask(resourceType: ResourceType, resourceId: string, type?: TaskType) {
  const client = db()
  let query = client
    .from("background_tasks")
    .select("*")
    .eq("resource_type", resourceType)
    .eq("resource_id", resourceId)
    .order("created_at", { ascending: false })
    .limit(1)

  if (type) {
    query = query.eq("type", type)
  }

  const { data, error } = await query.maybeSingle()

  if (error) {
    throw new Error(`查询任务失败: ${error.message}`)
  }

  return data
}

/**
 * 更新任务状态
 */
export async function updateTaskStatus(
  taskId: string,
  status: TaskStatus,
  extra?: {
    result?: TaskResult
    error_message?: string
    progress?: TaskProgress
  }
) {
  const client = db()
  const updateData: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
  }

  if (status === "processing") {
    updateData.started_at = new Date().toISOString()
  }

  if (status === "completed" || status === "failed") {
    updateData.completed_at = new Date().toISOString()
  }

  if (extra?.result) {
    updateData.result = extra.result
  }

  if (extra?.error_message) {
    updateData.error_message = extra.error_message
  }

  if (extra?.progress) {
    updateData.progress = extra.progress
  }

  const { error } = await client
    .from("background_tasks")
    .update(updateData)
    .eq("id", taskId)

  if (error) {
    throw new Error(`更新任务失败: ${error.message}`)
  }
}

/**
 * 清理超时的 processing 任务（超过10分钟还在 processing，认为已失败）
 */
export async function cleanupStaleTasks() {
  const client = db()
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString()

  const { error } = await client
    .from("background_tasks")
    .update({
      status: "failed",
      error_message: "任务超时，进程可能异常终止",
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("status", "processing")
    .lt("started_at", tenMinutesAgo)

  if (error) {
    console.error("[TaskQueue] 清理超时任务失败:", error.message)
  }
}
