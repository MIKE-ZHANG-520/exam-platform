import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getStorage, presignUrl } from "@/lib/storage";
import { requireSession } from "@/lib/auth";

export const runtime = "nodejs";
export const maxDuration = 60;

interface Params {
  params: Promise<{ workerId: string }>;
}

// GET /api/worker-profiles/[workerId]/briefings 获取交底记录
export async function GET(_request: NextRequest, { params }: Params) {
  const sess = await requireSession();
  if (!sess) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { workerId } = await params;
  const client = db();

  const { data: briefings, error } = await client
    .from("safety_briefings")
    .select("*")
    .eq("worker_id", workerId)
    .order("briefing_date", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // 生成预签名 URL
  const items = await Promise.all(
    (briefings || []).map(async (b) => {
      let signature_url = null;
      if (b.signature_url) {
        try {
          signature_url = await presignUrl(b.signature_url, 3600);
        } catch {
          signature_url = null;
        }
      }
      return { ...b, signature_url };
    })
  );

  return NextResponse.json({ items });
}

// POST /api/worker-profiles/[workerId]/briefings 添加入场交底记录
export async function POST(request: NextRequest, { params }: Params) {
  const sess = await requireSession();
  if (!sess) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { workerId } = await params;
  const formData = await request.formData();

  const briefingDate = formData.get("briefing_date") as string;
  const instructor = formData.get("instructor") as string;
  const content = formData.get("content") as string;

  if (!briefingDate || !instructor || !content) {
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

  // 处理签名照片上传
  let signatureUrl: string | null = null;
  const sigFile = formData.get("signature") as File | null;
  if (sigFile && sigFile.size > 0) {
    const storage = getStorage();
    const arrayBuffer = await sigFile.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const ext = sigFile.name.split(".").pop() || "png";
    signatureUrl = await storage.uploadFile({
      fileContent: buffer,
      fileName: `worker-profiles/${workerId}/signature_${Date.now()}.${ext}`,
      contentType: sigFile.type || "image/png",
    });
  }

  const { data, error } = await client
    .from("safety_briefings")
    .insert({
      worker_id: workerId,
      briefing_date: briefingDate,
      instructor,
      instructor_phone: (formData.get("instructor_phone") as string) || null,
      content,
      location: (formData.get("location") as string) || null,
      signature_url: signatureUrl,
      witness: (formData.get("witness") as string) || null,
      remark: (formData.get("remark") as string) || null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // 更新入场状态
  await updateAdmissionStatus(workerId);

  return NextResponse.json({ briefing: data });
}

// 更新入场状态
async function updateAdmissionStatus(workerId: string) {
  const client = db();

  const { data: profile } = await client
    .from("worker_profiles")
    .select("status")
    .eq("worker_id", workerId)
    .maybeSingle();

  if (!profile || profile.status !== "approved") return;

  const { data: trainings } = await client
    .from("safety_trainings")
    .select("level")
    .eq("worker_id", workerId);

  const levels = new Set((trainings || []).map((t) => t.level));
  const hasAllLevels = levels.has("company") && levels.has("project") && levels.has("team");

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
  }
}
