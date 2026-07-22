import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { makeLLM, extractJson, DEFAULT_MODEL } from "@/lib/ai";

export const runtime = "nodejs";

// POST /api/materials/[id]/save-parse
// 接收前端解析好的 PDF 文本内容，保存到材料记录并触发 AI 元数据抽取
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { id } = await params;
  const client = db();

  try {
    const body = await req.json();
    const { text, pageCount, wordCount, charCount } = body as {
      text?: string;
      pageCount?: number;
      wordCount?: number;
      charCount?: number;
    };

    if (!text || typeof text !== "string") {
      return NextResponse.json({ error: "缺少解析文本内容" }, { status: 400 });
    }

    // 检查材料是否存在
    const { data: material, error: fetchError } = await client
      .from("materials")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchError || !material) {
      return NextResponse.json({ error: "材料不存在" }, { status: 404 });
    }

    // 保存解析内容
    const updateData: Record<string, unknown> = {
      content_text: text,
      status: "parsed",
      metadata: {
        parse_stats: {
          char_count: charCount || text.length,
          word_count: wordCount || text.split(/\s+/).filter(Boolean).length,
          page_count: pageCount || 0,
          source: "frontend_pdfjs",
        },
      },
    };

    // AI 元数据抽取（非阻塞，失败不影响解析状态）
    try {
      const llm = makeLLM(req.headers);
      const preview = text.slice(0, 3000);
      const metaPrompt = `分析以下培训材料，提取元数据。返回 JSON：
{"title": "材料标题", "category": "分类（安全规范/操作手册/技术标准/培训教材/其他）", "tags": ["标签1","标签2"], "summary": "100字以内摘要"}

材料预览：
${preview}

只返回 JSON，不要其他文字。`;

      const resp = await llm.invoke(
        [{ role: "user", content: metaPrompt }],
        { model: DEFAULT_MODEL, temperature: 0.3 }
      );
      const metaData = extractJson<Record<string, unknown>>(resp.content);
      if (metaData) {
        if (metaData.title && String(metaData.title).trim()) {
          updateData.title = String(metaData.title).trim().slice(0, 100);
        }
        if (metaData.category) {
          updateData.category = String(metaData.category).trim().slice(0, 50);
        }
        if (Array.isArray(metaData.tags)) {
          updateData.tags = metaData.tags.map((t: unknown) => String(t).trim().slice(0, 30)).filter(Boolean).slice(0, 10);
        }
        if (metaData.summary) {
          updateData.summary = String(metaData.summary).trim().slice(0, 500);
        }
      }
    } catch (aiErr) {
      console.warn("AI metadata extraction failed:", aiErr instanceof Error ? aiErr.message : aiErr);
    }

    const { error: updateError } = await client
      .from("materials")
      .update(updateData)
      .eq("id", id);

    if (updateError) {
      console.error("Save parse result error:", updateError);
      return NextResponse.json({ error: "保存解析结果失败", detail: updateError.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      parse_stats: (updateData.metadata as Record<string, unknown>).parse_stats,
    });
  } catch (error) {
    console.error("Save parse result error:", error);
    const errMsg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: "保存解析结果失败", detail: errMsg }, { status: 500 });
  }
}
