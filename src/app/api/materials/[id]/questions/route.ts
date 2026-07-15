import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { makeLLM, extractJson, DEFAULT_MODEL } from "@/lib/ai";
import type { QuestionOption, QuestionType } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

interface Params {
  params: Promise<{ id: string }>;
}

interface RawQuestion {
  type: QuestionType;
  content: string;
  options: QuestionOption[];
  answer: string[];
  explanation?: string;
}

const EASY_PROMPT = `你是安全培训题库设计师，请基于给定材料出简易题库，全部 40 道题：
- 20 道单选题（type: "single"），4 个选项 A/B/C/D，只有 1 个正确答案；
- 20 道判断题（type: "judge"），选项固定为 [{"key":"A","text":"正确"},{"key":"B","text":"错误"}]，answer 为 ["A"] 或 ["B"]；
- 每题包含题干 content、答案 answer（数组）、答案解析 explanation。
输出严格的 JSON 数组，形如：
[{"type":"single","content":"...","options":[{"key":"A","text":"..."},{"key":"B","text":"..."},{"key":"C","text":"..."},{"key":"D","text":"..."}],"answer":["B"],"explanation":"..."}]
禁止任何多余说明、Markdown 代码块之外的文字。`;

const MEDIUM_PROMPT = `你是安全培训题库设计师，请基于给定材料出中等题库，共 40 道：
- 16 道单选题（type: "single"），4 个选项 A/B/C/D，1 个正确答案；
- 12 道多选题（type: "multiple"），4 个选项 A/B/C/D，2-4 个正确答案；
- 12 道判断题（type: "judge"），选项固定 [{"key":"A","text":"正确"},{"key":"B","text":"错误"}]。
每题字段：type / content / options / answer（数组）/ explanation。
输出严格的 JSON 数组，无 Markdown 之外说明。`;

function sanitizeQuestions(raw: RawQuestion[], difficulty: "easy" | "medium"): RawQuestion[] {
  const ok = raw.filter((q) => {
    if (!q || typeof q !== "object") return false;
    if (!["single", "multiple", "judge"].includes(q.type)) return false;
    if (!q.content || typeof q.content !== "string") return false;
    if (!Array.isArray(q.options) || q.options.length < 2) return false;
    if (!Array.isArray(q.answer) || q.answer.length === 0) return false;
    return true;
  });
  // 简单校验数量，不足则原样返回
  void difficulty;
  return ok.map((q) => ({
    type: q.type,
    content: q.content.trim(),
    options: q.options.map((o) => ({ key: String(o.key).toUpperCase(), text: String(o.text) })),
    answer: q.answer.map((a) => String(a).toUpperCase()),
    explanation: q.explanation ? String(q.explanation) : "",
  }));
}

// POST /api/materials/:id/questions
// body: { difficulty: 'easy' | 'medium' }
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const difficulty: "easy" | "medium" = body?.difficulty === "medium" ? "medium" : "easy";

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
    const systemPrompt = difficulty === "easy" ? EASY_PROMPT : MEDIUM_PROMPT;
    const userPrompt = `培训材料《${material.title}》：\n${material.content_text.slice(0, 14000)}\n\n请依据以上内容出题。`;

    const response = await llm.invoke(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      { model: DEFAULT_MODEL, temperature: 0.6 },
    );

    let parsed: RawQuestion[];
    try {
      parsed = extractJson<RawQuestion[]>(response.content);
      if (!Array.isArray(parsed)) throw new Error("模型返回的不是 JSON 数组");
    } catch (e) {
      const em = e instanceof Error ? e.message : String(e);
      return NextResponse.json({ error: `解析题库 JSON 失败: ${em}` }, { status: 500 });
    }

    const cleaned = sanitizeQuestions(parsed, difficulty);
    if (cleaned.length === 0) {
      return NextResponse.json({ error: "生成的题库为空" }, { status: 500 });
    }

    // 覆盖同类型旧题库
    const { data: oldBanks } = await client
      .from("question_banks")
      .select("id")
      .eq("material_id", id)
      .eq("difficulty", difficulty);
    if (oldBanks && oldBanks.length > 0) {
      const ids = oldBanks.map((b) => b.id);
      if (ids.length > 0) await client.from("question_banks").delete().in("id", ids);
    }

    const bankTitle = `${material.title} · ${difficulty === "easy" ? "简易" : "中等"}题库`;
    const { data: bank, error: bErr } = await client
      .from("question_banks")
      .insert({
        material_id: id,
        title: bankTitle,
        difficulty,
        total_count: cleaned.length,
        status: "draft",
      })
      .select("id, title, difficulty, total_count, status, created_at")
      .single();
    if (bErr) return NextResponse.json({ error: bErr.message }, { status: 500 });

    const rows = cleaned.map((q, idx) => ({
      bank_id: bank.id,
      type: q.type,
      content: q.content,
      options: q.options,
      answer: q.answer,
      explanation: q.explanation || null,
      order_no: idx + 1,
    }));

    // 分批插入
    const batchSize = 20;
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      const { error: qErr } = await client.from("questions").insert(batch);
      if (qErr) return NextResponse.json({ error: qErr.message }, { status: 500 });
    }

    return NextResponse.json({ bank, count: cleaned.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
