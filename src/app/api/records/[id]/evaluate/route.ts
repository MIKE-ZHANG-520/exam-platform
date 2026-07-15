import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";

interface Params {
  params: Promise<{ id: string }>;
}

// POST /api/records/:id/evaluate 提交讲师评价
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const body = await req.json();
    const clamp = (n: unknown) => {
      const v = Number(n);
      if (!Number.isFinite(v)) return 0;
      return Math.max(0, Math.min(5, Math.round(v)));
    };
    const score_content = clamp(body?.score_content);
    const score_clarity = clamp(body?.score_clarity);
    const score_interaction = clamp(body?.score_interaction);
    const score_time = clamp(body?.score_time);
    const score_overall = clamp(body?.score_overall);
    const comment = body?.comment ? String(body.comment).slice(0, 500) : null;

    const client = db();
    const { data: record } = await client
      .from("exam_records")
      .select("id, exam_id")
      .eq("id", id)
      .maybeSingle();
    if (!record) return NextResponse.json({ error: "答卷不存在" }, { status: 404 });

    // 移除该记录之前的评价，允许覆盖
    await client.from("evaluations").delete().eq("record_id", id);

    const { data, error } = await client
      .from("evaluations")
      .insert({
        record_id: id,
        exam_id: record.exam_id,
        score_content,
        score_clarity,
        score_interaction,
        score_time,
        score_overall,
        comment,
      })
      .select("id, created_at")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ evaluation: data });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
