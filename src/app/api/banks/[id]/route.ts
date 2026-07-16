import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";

export const runtime = "nodejs";

interface Params {
  params: Promise<{ id: string }>;
}

// GET /api/banks/:id 详情 + 全部题目
export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const client = db();
  const [{ data: bank, error: bErr }, { data: questions, error: qErr }] = await Promise.all([
    client
      .from("question_banks")
      .select("id, material_id, title, difficulty, total_count, status, published_at, created_at")
      .eq("id", id)
      .maybeSingle(),
    client
      .from("questions")
      .select("id, type, content, options, answer, explanation, order_no")
      .eq("bank_id", id)
      .order("order_no", { ascending: true })
      .limit(1000),
  ]);
  if (bErr) return NextResponse.json({ error: bErr.message }, { status: 500 });
  if (qErr) return NextResponse.json({ error: qErr.message }, { status: 500 });
  if (!bank) return NextResponse.json({ error: "题库不存在" }, { status: 404 });
  return NextResponse.json({ bank, questions: questions ?? [] });
}

// PATCH /api/banks/:id 更新标题或发布状态
export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = await req.json();
  const update: Record<string, unknown> = {};
  if (typeof body.title === "string") update.title = body.title;
  if (typeof body.difficulty === "string" && (body.difficulty === "easy" || body.difficulty === "medium")) {
    update.difficulty = body.difficulty;
  }
  if (body.status === "draft" || body.status === "published") {
    update.status = body.status;
    if (body.status === "published") update.published_at = new Date().toISOString();
  }
  const client = db();
  const { data, error } = await client.from("question_banks").update(update).eq("id", id).select().maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ bank: data });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const session = await getSession();
  if (session && session.role !== "admin") {
    return NextResponse.json({ error: "仅超级管理员可删除题库" }, { status: 403 });
  }
  const client = db();
  const { error } = await client.from("question_banks").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
