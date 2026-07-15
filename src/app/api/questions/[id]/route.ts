import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";

interface Params {
  params: Promise<{ id: string }>;
}

// PATCH /api/questions/:id
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const body = await req.json();
    const update: Record<string, unknown> = {};
    if (typeof body.content === "string") update.content = body.content;
    if (Array.isArray(body.options)) update.options = body.options;
    if (Array.isArray(body.answer)) update.answer = body.answer;
    if (typeof body.explanation === "string") update.explanation = body.explanation;
    if (["single", "multiple", "judge"].includes(body.type)) update.type = body.type;
    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: "无更新字段" }, { status: 400 });
    }
    const client = db();
    const { data, error } = await client
      .from("questions")
      .update(update)
      .eq("id", id)
      .select("id, type, content, options, answer, explanation, order_no")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ question: data });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// DELETE /api/questions/:id
export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const client = db();
  // 拿 bank_id 用于更新计数
  const { data: q } = await client
    .from("questions")
    .select("bank_id")
    .eq("id", id)
    .maybeSingle();
  const { error } = await client.from("questions").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (q?.bank_id) {
    const { count } = await client
      .from("questions")
      .select("*", { count: "exact", head: true })
      .eq("bank_id", q.bank_id);
    await client.from("question_banks").update({ total_count: count ?? 0 }).eq("id", q.bank_id);
  }
  return NextResponse.json({ success: true });
}
