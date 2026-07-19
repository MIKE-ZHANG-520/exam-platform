import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getStorage, presignUrl } from "@/lib/storage";
import { requireSession } from "@/lib/auth";

export const runtime = "nodejs";
export const maxDuration = 60;

interface Params {
  params: Promise<{ workerId: string }>;
}

// GET /api/worker-profiles/[workerId]/trainings 获取培训记录
export async function GET(_request: NextRequest, { params }: Params) {
  const sess = await requireSession();
  if (!sess) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { workerId } = await params;
  const client = db();

  const { data: trainings, error } = await client
    .from("safety_trainings")
    .select("*")
    .eq("worker_id", workerId)
    .order("training_date", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // 生成预签名 URL
  const items = await Promise.all(
    (trainings || []).map(async (t) => {
      let certificate_url = null;
      if (t.certificate_url) {
        try {
          certificate_url = await presignUrl(t.certificate_url, 3600);
        } catch {
          certificate_url = null;
        }
      }
      return { ...t, certificate_url };
    })
  );

  return NextResponse.json({ items });
}

// POST /api/worker-profiles/[workerId]/trainings 添加培训记录
export async function POST(request: NextRequest, { params }: Params) {
  const sess = await requireSession();
  if (!sess) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { workerId } = await params;
  const formData = await request.formData();

  const level = formData.get("level") as string;
  const trainingDate = formData.get("training_date") as string;
  const instructor = formData.get("instructor") as string;
  const content = formData.get("content") as string;

  if (!level || !trainingDate || !instructor) {
    return NextResponse.json({ error: "缺少必填字段" }, { status: 400 });
  }

  const client = db();

  // 验证工人存在
  const { data: worker } = await client
    .from("workers")
    .select("id")
    .eq("id", workerId)
    .maybeSingle();

  if (!worker) return NextResponse.json({ error: "工人不存在" }, { status: 404 });

  // 处理证书照片上传
  let certificateUrl: string | null = null;
  const certFile = formData.get("certificate") as File | null;
  if (certFile && certFile.size > 0) {
    const storage = getStorage();
    const arrayBuffer = await certFile.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const ext = certFile.name.split(".").pop() || "jpg";
    certificateUrl = await storage.uploadFile({
      fileContent: buffer,
      fileName: `worker-profiles/${workerId}/training_cert_${Date.now()}.${ext}`,
      contentType: certFile.type || "application/octet-stream",
    });
  }

  const { data, error } = await client
    .from("safety_trainings")
    .insert({
      worker_id: workerId,
      level,
      training_date: trainingDate,
      instructor,
      instructor_phone: (formData.get("instructor_phone") as string) || null,
      duration_hours: parseInt((formData.get("duration_hours") as string) || "2"),
      content: content || null,
      certificate_url: certificateUrl,
      exam_passed: formData.get("exam_passed") === "true",
      exam_score: formData.get("exam_score") ? parseInt(formData.get("exam_score") as string) : null,
      remark: (formData.get("remark") as string) || null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // 更新工人档案的入场状态
  await updateAdmissionStatus(workerId);

  return NextResponse.json({ training: data });
}

// 更新入场状态
async function updateAdmissionStatus(workerId: string) {
  const client = db();

  // 检查档案是否存在且审核通过
  const { data: profile } = await client
    .from("worker_profiles")
    .select("status")
    .eq("worker_id", workerId)
    .maybeSingle();

  if (!profile || profile.status !== "approved") return;

  // 检查三级教育完成情况
  const { data: trainings } = await client
    .from("safety_trainings")
    .select("level")
    .eq("worker_id", workerId);

  const levels = new Set((trainings || []).map((t) => t.level));
  const hasAllLevels = levels.has("company") && levels.has("project") && levels.has("team");

  // 检查是否有交底记录
  const { data: briefings } = await client
    .from("safety_briefings")
    .select("id")
    .eq("worker_id", workerId)
    .limit(1);

  if (hasAllLevels && briefings && briefings.length > 0) {
    await client
      .from("worker_profiles")
      .update({ admission_status: "admitted", updated_at: new Date().toISOString() })
      .eq("worker_id", workerId);
  } else if (hasAllLevels) {
    await client
      .from("worker_profiles")
      .update({ admission_status: "briefing", updated_at: new Date().toISOString() })
      .eq("worker_id", workerId);
  } else {
    await client
      .from("worker_profiles")
      .update({ admission_status: "training", updated_at: new Date().toISOString() })
      .eq("worker_id", workerId);
  }
}
