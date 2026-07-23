import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { logOperation, getClientIp, getUserAgent, OperationAction } from "@/lib/operation-log";

export const runtime = "nodejs";

// GET /api/exams 列表
export async function GET() {
  const client = db();
  const { data, error } = await client
    .from("exams")
    .select("id, title, bank_id, paper_type, duration_min, pass_score, total_score, max_attempts, config, status, created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data ?? [] });
}

// POST /api/exams 创建试卷
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      title,
      bank_id,
      paper_type,
      duration_min,
      pass_score,
      max_attempts,
      config,
      required_fields,
    } = body || {};

    if (!title || !bank_id) {
      return NextResponse.json({ error: "缺少 title / bank_id" }, { status: 400 });
    }
    if (!["A", "B"].includes(paper_type)) {
      return NextResponse.json({ error: "paper_type 必须是 A 或 B" }, { status: 400 });
    }

    // 默认值 A卷：20题(10单+10判)、20 分钟、80 及格；B卷：20题(8单+6多+6判)、30 分钟、80 及格
    const defaultConfig = paper_type === "A"
      ? { single: 10, multiple: 0, judge: 10 }
      : { single: 8, multiple: 6, judge: 6 };

    const defaultRequired = { name: true, phone: true, team: true, id_card: false };

    const client = db();

    // 检查题库题目数量是否足够
    const [{ count: singleCount }, { count: multipleCount }, { count: judgeCount }] = await Promise.all([
      client.from("questions").select("*", { count: "exact", head: true }).eq("bank_id", bank_id).eq("type", "single"),
      client.from("questions").select("*", { count: "exact", head: true }).eq("bank_id", bank_id).eq("type", "multiple"),
      client.from("questions").select("*", { count: "exact", head: true }).eq("bank_id", bank_id).eq("type", "judge"),
    ]);

    const finalConfig = { ...defaultConfig, ...(config || {}) };
    if ((singleCount ?? 0) < finalConfig.single) {
      return NextResponse.json({ error: `题库单选题不足（需 ${finalConfig.single}，实有 ${singleCount ?? 0}）` }, { status: 400 });
    }
    if ((multipleCount ?? 0) < finalConfig.multiple) {
      return NextResponse.json({ error: `题库多选题不足（需 ${finalConfig.multiple}，实有 ${multipleCount ?? 0}）` }, { status: 400 });
    }
    if ((judgeCount ?? 0) < finalConfig.judge) {
      return NextResponse.json({ error: `题库判断题不足（需 ${finalConfig.judge}，实有 ${judgeCount ?? 0}）` }, { status: 400 });
    }

    const { data, error } = await client
      .from("exams")
      .insert({
        title,
        bank_id,
        paper_type,
        duration_min: Number(duration_min) || (paper_type === "A" ? 20 : 30),
        pass_score: Number(pass_score) || 80,
        total_score: 100,
        max_attempts: Number(max_attempts) || 2,
        config: finalConfig,
        required_fields: { ...defaultRequired, ...(required_fields || {}) },
        status: "active",
      })
      .select("id, title, bank_id, paper_type, duration_min, pass_score, total_score, max_attempts, config, required_fields, status, created_at")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    
    // 记录创建日志
    const session = await getSession().catch(() => null);
    if (session) {
      logOperation({
        userId: session.id,
        userName: session.real_name || session.username,
        action: OperationAction.EXAM_CREATE,
        targetType: "exams",
        targetId: data?.id,
        detail: { title, bank_id, paper_type },
        ipAddress: getClientIp(req),
        userAgent: getUserAgent(req),
      });
    }
    
    return NextResponse.json({ exam: data });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
