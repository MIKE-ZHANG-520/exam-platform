import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { buildPaperSnapshot } from "@/lib/paper";
import { encryptSensitive, maskIdCard } from "@/lib/crypto";
import type { Question, PaperConfig } from "@/lib/types";

export const runtime = "nodejs";

interface Params {
  params: Promise<{ id: string }>;
}

// GET /api/exams/:id/public 公开的试卷信息（不含答案），供扫码后展示
export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const client = db();
  const { data, error } = await client
    .from("exams")
    .select("id, title, paper_type, duration_min, pass_score, total_score, max_attempts, required_fields, status")
    .eq("id", id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "试卷不存在" }, { status: 404 });
  if (data.status !== "active") {
    return NextResponse.json({ error: "试卷已归档" }, { status: 400 });
  }
  return NextResponse.json({ exam: data });
}

// POST /api/exams/:id/public 开始答题：写入考生信息 + 生成试卷快照
// body: { candidate_name, phone, team, id_card }
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const body = await req.json();
    const candidate_name = String(body?.candidate_name || "").trim();
    const phone = body?.phone ? String(body.phone).trim() : null;
    const team = body?.team ? String(body.team).trim() : null;
    const idCard = body?.id_card ? String(body.id_card).trim() : "";

    if (!candidate_name) return NextResponse.json({ error: "请填写姓名" }, { status: 400 });

    const client = db();
    const { data: exam, error: eErr } = await client
      .from("exams")
      .select("id, title, bank_id, paper_type, duration_min, config, max_attempts, pass_score, required_fields, status")
      .eq("id", id)
      .maybeSingle();
    if (eErr) return NextResponse.json({ error: eErr.message }, { status: 500 });
    if (!exam) return NextResponse.json({ error: "试卷不存在" }, { status: 404 });
    if (exam.status !== "active") return NextResponse.json({ error: "试卷已归档" }, { status: 400 });

    const required = (exam.required_fields as Record<string, boolean>) || {};
    if (required.phone && !phone) return NextResponse.json({ error: "请填写手机号" }, { status: 400 });
    if (required.team && !team) return NextResponse.json({ error: "请填写班组" }, { status: 400 });
    if (required.id_card && !idCard) return NextResponse.json({ error: "请填写身份证号" }, { status: 400 });

    // 校验尝试次数（12 小时窗口制：只统计近 12 小时内的考试次数）
    let attempt_no = 1;
    if (phone) {
      const windowStart = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
      const { data: recentHistory } = await client
        .from("exam_records")
        .select("id, attempt_no, is_pass, created_at")
        .eq("exam_id", id)
        .eq("phone", phone)
        .gte("created_at", windowStart)
        .order("created_at", { ascending: false });

      // 全量历史查询（仅用于计算累计 attempt_no，不限制考试机会）
      const { data: allHistory } = await client
        .from("exam_records")
        .select("id, attempt_no")
        .eq("exam_id", id)
        .eq("phone", phone)
        .order("attempt_no", { ascending: false });

      const recentList = recentHistory ?? [];
      const allList = allHistory ?? [];
      const maxAttempts = exam.max_attempts ?? 2;

      if (recentList.length >= maxAttempts) {
        return NextResponse.json({ error: `12 小时内已有 ${recentList.length} 次考试记录，请 12 小时后再试（累计已考 ${allList.length} 次）` }, { status: 403 });
      }

      // attempt_no 基于全量历史递增，保证编号连续
      attempt_no = allList.length + 1;
    }

    // 加载题库
    const { data: qs, error: qErr } = await client
      .from("questions")
      .select("id, bank_id, type, content, options, answer, explanation, order_no")
      .eq("bank_id", exam.bank_id)
      .limit(500);
    if (qErr) return NextResponse.json({ error: qErr.message }, { status: 500 });
    if (!qs || qs.length === 0) return NextResponse.json({ error: "题库为空" }, { status: 400 });

    const snapshot = buildPaperSnapshot(qs as Question[], exam.config as PaperConfig);

    const idCardEncrypted = idCard ? encryptSensitive(idCard) : null;
    const idCardMask = idCard ? maskIdCard(idCard) : null;

    const { data: record, error: rErr } = await client
      .from("exam_records")
      .insert({
        exam_id: id,
        candidate_name,
        phone,
        team,
        id_card_encrypted: idCardEncrypted,
        id_card_mask: idCardMask,
        paper_snapshot: snapshot,
        answers: {},
        attempt_no,
        status: "ongoing",
        switch_count: 0,
        started_at: new Date().toISOString(),
      })
      .select("id, started_at, attempt_no")
      .single();
    if (rErr) return NextResponse.json({ error: rErr.message }, { status: 500 });

    // 返回给前端的题目（不含 answer / explanation）
    const publicItems = snapshot.items.map((it) => ({
      question_id: it.question_id,
      type: it.type,
      content: it.content,
      options: it.options,
    }));

    return NextResponse.json({
      record_id: record.id,
      started_at: record.started_at,
      attempt_no: record.attempt_no,
      duration_min: exam.duration_min,
      pass_score: exam.pass_score,
      total: publicItems.length,
      items: publicItems,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
