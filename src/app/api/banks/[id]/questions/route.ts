import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import type { QuestionOption, QuestionType } from "@/lib/types";

export const runtime = "nodejs";

interface Params {
  params: Promise<{ id: string }>;
}

// GET /api/banks/:id/questions 列出题库下所有题目
export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const client = db();
  const { data, error } = await client
    .from("questions")
    .select("id, bank_id, type, content, options, answer, explanation, order_no, created_at")
    .eq("bank_id", id)
    .order("order_no", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data ?? [] });
}

// POST /api/banks/:id/questions 新增题目
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const body = await req.json();
    const type: QuestionType = body?.type;
    const content: string = (body?.content || "").trim();
    const options: QuestionOption[] = Array.isArray(body?.options) ? body.options : [];
    const answer: string[] = Array.isArray(body?.answer) ? body.answer : [];
    const explanation: string | null = body?.explanation ? String(body.explanation) : null;

    if (!["single", "multiple", "judge"].includes(type)) {
      return NextResponse.json({ error: "type 非法" }, { status: 400 });
    }
    if (!content) return NextResponse.json({ error: "题干不能为空" }, { status: 400 });
    if (options.length < 2) return NextResponse.json({ error: "至少两个选项" }, { status: 400 });
    if (answer.length === 0) return NextResponse.json({ error: "至少一个正确答案" }, { status: 400 });

    const client = db();
    // 计算 order_no
    const { data: last } = await client
      .from("questions")
      .select("order_no")
      .eq("bank_id", id)
      .order("order_no", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextOrder = (last?.order_no ?? 0) + 1;

    const { data, error } = await client
      .from("questions")
      .insert({
        bank_id: id,
        type,
        content,
        options,
        answer,
        explanation,
        order_no: nextOrder,
      })
      .select("id, type, content, options, answer, explanation, order_no")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // 更新 total_count
    const { count } = await client
      .from("questions")
      .select("*", { count: "exact", head: true })
      .eq("bank_id", id);
    await client.from("question_banks").update({ total_count: count ?? 0 }).eq("id", id);

    return NextResponse.json({ question: data });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
