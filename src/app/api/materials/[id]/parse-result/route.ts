import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

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
 * POST /api/materials/[id]/parse-result
 * 外部 Agent 回写解析结果
 * 认证：X-Parse-Token 请求头
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // 验证 API Token
  if (!verifyParseToken(request)) {
    return NextResponse.json({ error: "未授权：无效的 API Token" }, { status: 401 })
  }

  try {
    const { id } = await params
    const body = await request.json()
    const { status, text_content, page_count, word_count, error } = body as {
      status?: string
      text_content?: string
      page_count?: number
      word_count?: number
      error?: string
    }

    // 验证参数
    if (!status || !["completed", "failed"].includes(status)) {
      return NextResponse.json(
        { error: "status 参数无效，必须是 completed 或 failed" },
        { status: 400 }
      )
    }

    const client = db()

    // 检查材料是否存在
    const { data: existing, error: selectError } = await client
      .from("materials")
      .select("id")
      .eq("id", id)
      .limit(1)

    if (selectError) {
      throw new Error(selectError.message)
    }

    if (!existing || existing.length === 0) {
      return NextResponse.json({ error: "材料不存在" }, { status: 404 })
    }

    // 根据状态更新材料
    if (status === "completed") {
      if (!text_content) {
        return NextResponse.json(
          { error: "status=completed 时必须提供 text_content" },
          { status: 400 }
        )
      }

      // 计算字数（如果未提供）
      const calculatedWordCount = word_count ?? text_content.replace(/\s/g, "").length

      const { error: updateError } = await client
        .from("materials")
        .update({
          status: "parsed",
          content_text: text_content,
          parse_source: "external",
          error_message: null,
          parse_stats: {
            char_count: text_content.length,
            word_count: calculatedWordCount,
            page_count: page_count ?? null,
            parsed_at: new Date().toISOString(),
          },
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)

      if (updateError) {
        throw new Error(updateError.message)
      }

      return NextResponse.json({
        success: true,
        message: "解析结果已保存",
        data: {
          id,
          status: "parsed",
          word_count: calculatedWordCount,
          page_count: page_count ?? null,
        },
      })
    } else {
      // status === "failed"
      const { error: updateError } = await client
        .from("materials")
        .update({
          status: "failed",
          parse_source: "external",
          error_message: error || "解析失败，未提供错误信息",
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)

      if (updateError) {
        throw new Error(updateError.message)
      }

      return NextResponse.json({
        success: true,
        message: "失败状态已记录",
        data: {
          id,
          status: "failed",
          error: error || "解析失败",
        },
      })
    }
  } catch (error) {
    console.error("回写解析结果失败:", error)
    return NextResponse.json(
      { error: "回写解析结果失败", detail: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}
