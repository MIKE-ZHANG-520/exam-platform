import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";

// GET /api/records  管理端记录列表 + 筛选
// query: name, team, exam_id, is_pass, start_date, end_date
export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const name = url.searchParams.get("name");
  const team = url.searchParams.get("team");
  const examId = url.searchParams.get("exam_id");
  const isPass = url.searchParams.get("is_pass");
  const startDate = url.searchParams.get("start_date") || url.searchParams.get("start");
  const endDate = url.searchParams.get("end_date") || url.searchParams.get("end");

  const client = db();
  let query = client
    .from("exam_records")
    .select("id, exam_id, candidate_name, phone, team, id_card_mask, score, is_pass, attempt_no, status, switch_count, duration_sec, started_at, submitted_at, created_at")
    .order("created_at", { ascending: false })
    .limit(500);

  if (name) query = query.ilike("candidate_name", `%${name}%`);
  if (team) query = query.eq("team", team);
  if (examId) query = query.eq("exam_id", examId);
  if (isPass === "true") query = query.eq("is_pass", true);
  if (isPass === "false") query = query.eq("is_pass", false);
  if (startDate) query = query.gte("created_at", startDate);
  if (endDate) query = query.lte("created_at", endDate + "T23:59:59");

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // 关联试卷标题
  const examIds = Array.from(new Set((data ?? []).map((r) => r.exam_id).filter(Boolean))) as string[];
  let examMap: Record<string, { id: string; title: string; paper_type: string }> = {};
  if (examIds.length > 0) {
    const { data: exs } = await client
      .from("exams")
      .select("id, title, paper_type")
      .in("id", examIds);
    examMap = Object.fromEntries((exs ?? []).map((e) => [e.id, e]));
  }

  const items = (data ?? []).map((r) => ({
    ...r,
    exam_title: examMap[r.exam_id]?.title || null,
    paper_type: examMap[r.exam_id]?.paper_type || null,
  }));

  return NextResponse.json({ items });
}
