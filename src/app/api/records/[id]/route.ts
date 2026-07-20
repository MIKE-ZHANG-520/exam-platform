import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionFromReq } from "@/lib/auth";

export const runtime = "nodejs";

interface Params {
  params: Promise<{ id: string }>;
}

// GET /api/records/:id  查询答卷（含详情，用于评价页/结果页）
export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const client = db();
  const { data, error } = await client
    .from("exam_records")
    .select("id, exam_id, candidate_name, phone, team, id_card_mask, score, is_pass, attempt_no, status, switch_count, duration_sec, started_at, submitted_at, paper_snapshot, answers, created_at")
    .eq("id", id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "记录不存在" }, { status: 404 });

  const { data: exam } = await client
    .from("exams")
    .select("id, title, pass_score, paper_type")
    .eq("id", data.exam_id)
    .maybeSingle();

  return NextResponse.json({ record: data, exam });
}

// PATCH /api/records/:id  用于切屏计数上报
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const body = await req.json();
    const update: Record<string, unknown> = {};
    if (Number.isFinite(body?.switch_count)) update.switch_count = Number(body.switch_count);
    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: "无更新字段" }, { status: 400 });
    }
    const client = db();
    const { error } = await client.from("exam_records").update(update).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// DELETE /api/records/:id  删除考试记录（仅admin）
export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const session = await getSessionFromReq(req);
    if (!session) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }
    if (session.role !== "admin") {
      return NextResponse.json({ error: "无权限，仅管理员可删除" }, { status: 403 });
    }

    const { id } = await params;
    const client = db();
    const { error } = await client.from("exam_records").delete().eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
