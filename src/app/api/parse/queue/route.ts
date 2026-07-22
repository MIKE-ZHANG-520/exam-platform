import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { presignUrl } from "@/lib/storage"

export const runtime = "nodejs"

// API Token 认证中间件
function verifyParseToken(request: NextRequest): boolean {
  const token = request.headers.get("X-Parse-Token")
  const expectedToken = process.env.PARSE_API_TOKEN
  if (!expectedToken) {
    console.error("PARSE_API_TOKEN 环境变量未配置")
    return false
  }
  return token === expectedToken
}

/**
 * GET /api/parse/queue
 * 获取待解析队列（外部 Agent 调用）
 * 认证：X-Parse-Token 请求头
 */
export async function GET(request: NextRequest) {
  // 验证 API Token
  if (!verifyParseToken(request)) {
    return NextResponse.json({ error: "未授权：无效的 API Token" }, { status: 401 })
  }

  try {
    const client = db()

    // 查询待解析的材料（status = "pending"）
    const { data: pendingMaterials, error } = await client
      .from("materials")
      .select("id, file_name, file_key, file_type, file_size, created_at")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(50)

    if (error) {
      throw new Error(error.message)
    }

    // 为每个材料生成预签名 URL
    const result = await Promise.all(
      (pendingMaterials || []).map(async (m: { id: string; file_name: string; file_key: string; file_type: string; file_size: number; created_at: string }) => {
        let fileUrl = ""
        try {
          fileUrl = await presignUrl(m.file_key)
        } catch {
          // 如果获取签名 URL 失败，使用空字符串
        }
        return {
          id: m.id,
          filename: m.file_name,
          file_url: fileUrl,
          file_type: m.file_type,
          file_size: m.file_size,
          created_at: m.created_at,
        }
      })
    )

    return NextResponse.json({
      success: true,
      count: result.length,
      items: result,
    })
  } catch (error) {
    console.error("获取解析队列失败:", error)
    return NextResponse.json(
      { error: "获取解析队列失败", detail: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}
