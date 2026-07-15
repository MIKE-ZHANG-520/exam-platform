import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";

interface ExamRecordRow {
  id: string;
  exam_id: string;
  team: string | null;
  score: number | null;
  is_pass: boolean | null;
  status: string | null;
  attempt_no: number | null;
  created_at: string;
}

// GET /api/dashboard  数据看板汇总
export async function GET() {
  const client = db();

  // 全部记录（最近 5000 条）
  const { data: recRaw, error: rErr } = await client
    .from("exam_records")
    .select("id, exam_id, team, score, is_pass, status, attempt_no, created_at")
    .order("created_at", { ascending: false })
    .limit(5000);
  if (rErr) return NextResponse.json({ error: rErr.message }, { status: 500 });
  const records = (recRaw ?? []) as ExamRecordRow[];

  // 只统计已完成的
  const finished = records.filter((r) => r.status && r.status !== "ongoing");

  const total = finished.length;
  const passed = finished.filter((r) => r.is_pass).length;
  const failed = total - passed;
  const passRate = total > 0 ? Math.round((passed / total) * 1000) / 10 : 0;

  // 参考人数（按不同手机号或姓名去重较复杂，这里按 attempt_no=1 数量）
  const firstAttempts = finished.filter((r) => r.attempt_no === 1).length;

  // 平均分
  const avgScore = total > 0
    ? Math.round((finished.reduce((sum, r) => sum + (r.score ?? 0), 0) / total) * 10) / 10
    : 0;

  // 待补考：不及格且尝试次数 < 2 的
  const failedRetakes = finished.filter((r) => r.is_pass === false && (r.attempt_no ?? 0) < 2);
  const pendingRetake = failedRetakes.length;

  // 班组完成率
  const teamMap = new Map<string, { participated: number; passed: number }>();
  finished.forEach((r) => {
    const t = r.team || "未分组";
    if (!teamMap.has(t)) teamMap.set(t, { participated: 0, passed: 0 });
    const bucket = teamMap.get(t)!;
    bucket.participated += 1;
    if (r.is_pass) bucket.passed += 1;
  });
  const teamStats = Array.from(teamMap.entries()).map(([team, v]) => ({
    team,
    participated: v.participated,
    passed: v.passed,
    pass_rate: v.participated > 0 ? Math.round((v.passed / v.participated) * 1000) / 10 : 0,
  })).sort((a, b) => b.pass_rate - a.pass_rate);

  // 近 7 天趋势
  const trend: Array<{ date: string; participated: number; passed: number }> = [];
  const today = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    trend.push({ date: key, participated: 0, passed: 0 });
  }
  finished.forEach((r) => {
    const key = r.created_at.slice(0, 10);
    const bucket = trend.find((t) => t.date === key);
    if (bucket) {
      bucket.participated += 1;
      if (r.is_pass) bucket.passed += 1;
    }
  });

  // 分数段分布
  const scoreBuckets = [
    { name: "不及格(<60)", min: 0, max: 59, count: 0 },
    { name: "60-79", min: 60, max: 79, count: 0 },
    { name: "80-89", min: 80, max: 89, count: 0 },
    { name: "90-100", min: 90, max: 100, count: 0 },
  ];
  finished.forEach((r) => {
    const s = r.score ?? 0;
    const b = scoreBuckets.find((bk) => s >= bk.min && s <= bk.max);
    if (b) b.count += 1;
  });

  // 待补考清单
  const { data: retakeList } = await client
    .from("exam_records")
    .select("id, candidate_name, phone, team, score, attempt_no, exam_id, created_at")
    .eq("is_pass", false)
    .lt("attempt_no", 2)
    .order("created_at", { ascending: false })
    .limit(100);

  return NextResponse.json({
    kpi: {
      total_records: total,
      first_attempts: firstAttempts,
      passed,
      failed,
      pass_rate: passRate,
      avg_score: avgScore,
      pending_retake: pendingRetake,
    },
    team_stats: teamStats,
    trend,
    score_buckets: scoreBuckets,
    retake_list: retakeList ?? [],
  });
}
