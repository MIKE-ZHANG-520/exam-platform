import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { makeLLM, extractJson, DEFAULT_MODEL } from "@/lib/ai";

export const runtime = "nodejs";
export const maxDuration = 300;

interface Params {
  params: Promise<{ id: string }>;
}

const WORKER_PROMPT = `你是一线工人安全培训领域的资深专家。请严格基于给出的原始材料，为工人编写一份可直接讲的培训提纲。要求：
1. 至少输出 4-6 个二级章节，每个章节用 "## 章节标题" 开头，标题要口语化（如 "上岗前查这三样"、"高处作业记住三系两不能"）。
2. 每个章节内部按类型输出条目（每条独占一行）：
   - "✅ 正确做法：xxx"（推荐做法）
   - "⚠️ 注意事项：xxx"（容易忽略的细节）
   - "🔴 禁止行为：xxx"（严禁触碰的红线）
   - "1️⃣ / 2️⃣ ..." 或 "① ② ③" 编号（步骤类）
   - "**重点**：xxx"（当条内容需要红色高亮时用 **加粗** 包裹关键短语）
3. 每个章节末尾附一段口诀，格式：
   > 💡 口诀：xxxxxxx
4. 全篇不要出现 Markdown 表格，也不要写代码块。
5. 内容必须来自原始材料，禁止编造与材料无关的规范。`;

const TRAINER_PROMPT = `你是培训师授课手册作者，请为讲师输出可直接照讲的备课提纲。要求：
1. 使用 "## 章节标题" 划分至少 4 个章节，每章节内部按下面固定的四类结构编写（每类可有多条）：
   - "🎯 核心知识点：xxx"
   - "⚠️ 常见误区：xxx"
   - "💬 互动设问：xxx？"
   - "⏱️ 时间分配：xx 分钟 —— 说明"
2. 全篇开头先给一句总时长建议，例如 "**总时长建议：45 分钟**"。
3. 内容严格贴合原始材料，禁止空谈。禁止输出代码块 / 表格。`;

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
    const outlineTitle = `${material.title} · ${audience === "worker" ? "工人版" : "培训师版"}提纲`;
    const { data: inserted, error: iErr } = await client
      .from("outlines")
      .insert({ material_id: id, audience, content_md, title: outlineTitle, status: "draft" })
      .select("id, audience, title, content_md, status, created_at")
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
