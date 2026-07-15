import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { makeLLM, extractJson, DEFAULT_MODEL } from "@/lib/ai";

export const runtime = "nodejs";
export const maxDuration = 300;

interface Params {
  params: Promise<{ id: string }>;
}

const WORKER_PROMPT = `你是安全培训领域的专家，需要为一线工人编写培训提纲。要求：
1. 口语化标题（例如"电动工具三查"、"高处作业穿这三样"），避免书面语；
2. 每条要点用 ① ② ③ 编号，简短好记；
3. 遇到危险场景要具体化，例如"雨天在户外用没漏电保护的电钻会被电到"；
4. 在结尾附一段"顺口溜"或"记忆口诀"帮助工人记住；
5. 关键危险动作用【重点】标注；
6. 输出使用 Markdown，段落之间空一行。`;

const TRAINER_PROMPT = `你是培训师授课手册作者，需要为讲师提供备课提纲。要求：
1. 每个知识点列出核心要点（专业术语可保留）；
2. 标出常见误区（工人容易搞错的地方）；
3. 给出互动设问建议（3-5 个开放问题，帮助讲师课堂点名互动）；
4. 每个大节标出建议时间分配（分钟）；
5. 输出使用 Markdown，先给出总时长建议，再分节展开。`;

// POST /api/materials/:id/outline 生成培训提纲
// body: { audience: 'worker' | 'trainer' }
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const audience: "worker" | "trainer" = body?.audience === "trainer" ? "trainer" : "worker";

    const client = db();
    const { data: material, error: mErr } = await client
      .from("materials")
      .select("id, title, content_text")
      .eq("id", id)
      .maybeSingle();
    if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 });
    if (!material) return NextResponse.json({ error: "材料不存在" }, { status: 404 });
    if (!material.content_text) {
      return NextResponse.json({ error: "材料尚未解析，请先执行解析" }, { status: 400 });
    }

    const llm = makeLLM(req.headers);
    const systemPrompt = audience === "worker" ? WORKER_PROMPT : TRAINER_PROMPT;
    const userPrompt = `培训材料标题：《${material.title}》\n\n以下是原始材料内容（可能截断）：\n${material.content_text.slice(0, 12000)}\n\n请依据以上内容输出 Markdown 提纲。`;

    const response = await llm.invoke(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      { model: DEFAULT_MODEL, temperature: 0.5 },
    );

    const content_md = response.content?.trim();
    if (!content_md) return NextResponse.json({ error: "生成结果为空" }, { status: 500 });

    // 覆盖同 audience 的旧提纲
    await client.from("outlines").delete().eq("material_id", id).eq("audience", audience);
    const { data: inserted, error: iErr } = await client
      .from("outlines")
      .insert({ material_id: id, audience, content_md })
      .select("id, audience, content_md, created_at")
      .single();
    if (iErr) return NextResponse.json({ error: iErr.message }, { status: 500 });

    return NextResponse.json({ outline: inserted });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// 忽略 extractJson 未使用（其它 handler 会用）
void extractJson;
