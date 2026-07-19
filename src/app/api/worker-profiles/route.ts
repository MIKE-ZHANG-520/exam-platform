import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getStorage, presignUrl } from "@/lib/storage";
import { requireSession } from "@/lib/auth";

export const runtime = "nodejs";
export const maxDuration = 60;

// GET /api/worker-profiles?worker_id=xxx 获取工人档案
export async function GET(request: NextRequest) {
  const sess = await requireSession();
  if (!sess) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const workerId = searchParams.get("worker_id");

  if (!workerId) {
    return NextResponse.json({ error: "缺少 worker_id" }, { status: 400 });
  }

  const client = db();
  const { data: profile, error } = await client
    .from("worker_profiles")
    .select("*")
    .eq("worker_id", workerId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // 生成预签名 URL
  if (profile) {
    const urls: Record<string, string | null> = {};
    const fields = [
      "id_card_front_url",
      "id_card_back_url",
      "special_cert_url",
      "health_report_url",
      "qr_code_url",
    ];
    for (const field of fields) {
      const key = profile[field as keyof typeof profile] as string | null;
      if (key) {
        try {
          urls[field] = await presignUrl(key, 3600);
        } catch {
          urls[field] = null;
        }
      } else {
        urls[field] = null;
      }
    }
    return NextResponse.json({ profile: { ...profile, urls } });
  }

  return NextResponse.json({ profile: null });
}

// POST /api/worker-profiles 创建/更新工人档案
export async function POST(request: NextRequest) {
  const sess = await requireSession();
  if (!sess) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const formData = await request.formData();
  const workerId = formData.get("worker_id") as string;

  if (!workerId) {
    return NextResponse.json({ error: "缺少 worker_id" }, { status: 400 });
  }

  const client = db();

  // 检查工人是否存在
  const { data: worker, error: wErr } = await client
    .from("workers")
    .select("id, name, id_card_encrypted")
    .eq("id", workerId)
    .maybeSingle();

  if (wErr) return NextResponse.json({ error: wErr.message }, { status: 500 });
  if (!worker) return NextResponse.json({ error: "工人不存在" }, { status: 404 });

  // 检查是否已有档案
  const { data: existing } = await client
    .from("worker_profiles")
    .select("id")
    .eq("worker_id", workerId)
    .maybeSingle();

  const storage = getStorage();
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  // 处理上传的文件
  const fileFields = [
    "id_card_front",
    "id_card_back",
    "special_cert",
    "health_report",
  ];

  for (const field of fileFields) {
    const file = formData.get(field) as File | null;
    if (file && file.size > 0) {
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const ext = file.name.split(".").pop() || "jpg";
      const key = await storage.uploadFile({
        fileContent: buffer,
        fileName: `worker-profiles/${workerId}/${field}_${Date.now()}.${ext}`,
        contentType: file.type || "application/octet-stream",
      });

      // 映射到数据库字段
      const dbFieldMap: Record<string, string> = {
        id_card_front: "id_card_front_url",
        id_card_back: "id_card_back_url",
        special_cert: "special_cert_url",
        health_report: "health_report_url",
      };
      updates[dbFieldMap[field]] = key;
    }
  }

  // 处理文本字段
  const textFields = [
    "special_cert_type",
    "special_cert_no",
    "special_cert_issue_date",
    "special_cert_expire_date",
    "health_check_date",
  ];

  for (const field of textFields) {
    const value = formData.get(field) as string | null;
    if (value !== null && value !== "") {
      updates[field] = value;
    }
  }

  let result;
  if (existing) {
    // 更新
    const { data, error } = await client
      .from("worker_profiles")
      .update(updates)
      .eq("worker_id", workerId)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    result = data;
  } else {
    // 创建
    const { data, error } = await client
      .from("worker_profiles")
      .insert({ worker_id: workerId, ...updates })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    result = data;
  }

  return NextResponse.json({ profile: result });
}
