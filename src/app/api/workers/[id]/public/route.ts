import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { presignUrl } from "@/lib/storage";

export const runtime = "nodejs";

interface Params {
  params: Promise<{ id: string }>;
}

// GET /api/workers/[id]/public 公开接口 - 扫码查询
export async function GET(_request: NextRequest, { params }: Params) {
  const { id: workerId } = await params;
  const client = db();

  // 获取工人基本信息
  const { data: worker, error: wErr } = await client
    .from("workers")
    .select("id, name, gender, birth_year, work_type, team_id")
    .eq("id", workerId)
    .maybeSingle();

  if (wErr) return NextResponse.json({ error: wErr.message }, { status: 500 });
  if (!worker) return NextResponse.json({ error: "工人不存在" }, { status: 404 });

  // 获取班组信息
  let teamName: string | null = null;
  if (worker.team_id) {
    const { data: team } = await client
      .from("teams")
      .select("name")
      .eq("id", worker.team_id)
      .maybeSingle();
    teamName = team?.name || null;
  }

  // 获取档案信息
  const { data: profile } = await client
    .from("worker_profiles")
    .select("*")
    .eq("worker_id", workerId)
    .maybeSingle();

  // 获取培训记录
  const { data: trainings } = await client
    .from("safety_trainings")
    .select("*")
    .eq("worker_id", workerId)
    .order("training_date", { ascending: false });

  // 获取交底记录
  const { data: briefings } = await client
    .from("safety_briefings")
    .select("*")
    .eq("worker_id", workerId)
    .order("briefing_date", { ascending: false });

  // 获取专项培训
  const { data: specialTrainings } = await client
    .from("special_trainings")
    .select("*")
    .eq("worker_id", workerId)
    .order("training_date", { ascending: false });

  // 生成预签名 URL
  let certUrl = null;
  if (profile?.special_cert_url) {
    try {
      certUrl = await presignUrl(profile.special_cert_url, 3600);
    } catch {
      certUrl = null;
    }
  }

  // 计算年龄
  const age = worker.birth_year ? new Date().getFullYear() - worker.birth_year : null;

  // 检查证件是否过期
  let certStatus = "none";
  if (profile?.special_cert_expire_date) {
    const expireDate = new Date(profile.special_cert_expire_date);
    const now = new Date();
    if (expireDate < now) {
      certStatus = "expired";
    } else if (expireDate < new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)) {
      certStatus = "expiring";
    } else {
      certStatus = "valid";
    }
  }

  // 统计培训次数
  const trainingStats = {
    company: trainings?.filter((t) => t.level === "company").length || 0,
    project: trainings?.filter((t) => t.level === "project").length || 0,
    team: trainings?.filter((t) => t.level === "team").length || 0,
    total: trainings?.length || 0,
  };

  return NextResponse.json({
    worker: {
      name: worker.name,
      gender: worker.gender,
      age,
      work_type: worker.work_type,
      team_name: teamName,
    },
    profile: {
      status: profile?.status || "not_created",
      admission_status: profile?.admission_status || "not_started",
      special_cert_type: profile?.special_cert_type,
      special_cert_expire_date: profile?.special_cert_expire_date,
      cert_status: certStatus,
      cert_url: certUrl,
    },
    training_stats: trainingStats,
    trainings: trainings?.map((t) => ({
      level: t.level,
      training_date: t.training_date,
      instructor: t.instructor,
      duration_hours: t.duration_hours,
      exam_passed: t.exam_passed,
    })) || [],
    briefings: briefings?.map((b) => ({
      briefing_date: b.briefing_date,
      instructor: b.instructor,
      location: b.location,
    })) || [],
    special_trainings: specialTrainings?.map((t) => ({
      title: t.title,
      training_date: t.training_date,
      duration_hours: t.duration_hours,
    })) || [],
  });
}
