import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";

interface Params {
  params: Promise<{ id: string }>;
}

// GET /api/exams/:id （管理端使用，含 required_fields 等）
export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const client = db();
  const { data, error } = await client
    .from("exams")
    .select("id, title, bank_id, paper_type, duration_min, pass_score, total_score, max_attempts, config, required_fields, status, created_at")
    .eq("id", id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "试卷不存在" }, { status: 404 });

  // 关联题库
  const { data: bank } = await client
    .from("question_banks")
    .select("id, title, difficulty, total_count")
    .eq("id", data.bank_id)
    .maybeSingle();

  return NextResponse.json({ exam: data, bank });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const client = db();
  const { error } = await client.from("exams").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
