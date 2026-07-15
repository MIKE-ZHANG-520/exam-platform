import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { scorePaper } from "@/lib/paper";
import type { PaperSnapshot } from "@/lib/types";

export const runtime = "nodejs";

interface Params {
  params: Promise<{ id: string }>;
}

// POST /api/records/:id/submit  提交答卷
// body: { answers: { qid: ['A'] }, auto_submit?: boolean, switch_count?: number }
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const body = await req.json();
    const answers = (body?.answers && typeof body.answers === "object") ? body.answers as Record<string, string[]> : {};
    const auto = Boolean(body?.auto_submit);
    const switchCount = Number.isFinite(body?.switch_count) ? Number(body.switch_count) : undefined;

    const client = db();
    const { data: record, error: rErr } = await client
      .from("exam_records")
      .select("id, exam_id, paper_snapshot, status, started_at, switch_count")
      .eq("id", id)
      .maybeSingle();
    if (rErr) return NextResponse.json({ error: rErr.message }, { status: 500 });
    if (!record) return NextResponse.json({ error: "答卷不存在" }, { status: 404 });
    if (record.status !== "ongoing") {
      return NextResponse.json({ error: "答卷已提交" }, { status: 400 });
    }

    const snapshot = record.paper_snapshot as PaperSnapshot;
    const { data: exam } = await client
      .from("exams")
      .select("pass_score")
      .eq("id", record.exam_id)
      .maybeSingle();
    const passScore = exam?.pass_score ?? 80;

    const { score } = scorePaper(snapshot, answers);
    const isPass = score >= passScore;
    const now = new Date();
    const startedAt = record.started_at ? new Date(record.started_at as string) : now;
    const duration = Math.max(0, Math.floor((now.getTime() - startedAt.getTime()) / 1000));

    const updatePayload: Record<string, unknown> = {
      answers,
      score,
      is_pass: isPass,
      status: auto ? "auto_submitted" : "submitted",
      submitted_at: now.toISOString(),
      duration_sec: duration,
    };
    if (switchCount !== undefined) updatePayload.switch_count = switchCount;

    const { error: uErr } = await client
      .from("exam_records")
      .update(updatePayload)
      .eq("id", id);
    if (uErr) return NextResponse.json({ error: uErr.message }, { status: 500 });

    return NextResponse.json({
      record_id: id,
      score,
      is_pass: isPass,
      pass_score: passScore,
      duration_sec: duration,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
