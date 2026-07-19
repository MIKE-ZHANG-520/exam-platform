import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import QRCode from "qrcode";

export const runtime = "nodejs";
export const maxDuration = 60;

interface Params {
  params: Promise<{ workerId: string }>;
}

// POST /api/worker-profiles/[workerId]/review 审核档案
export async function POST(request: NextRequest, { params }: Params) {
  const sess = await requireSession();
  if (!sess) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { workerId } = await params;
  const body = await request.json();
  const { action, reject_reason } = body as { action: "approve" | "reject"; reject_reason?: string };

  if (!action || !["approve", "reject"].includes(action)) {
    return NextResponse.json({ error: "无效的操作" }, { status: 400 });
  }

  const client = db();

  const { data: profile, error: pErr } = await client
    .from("worker_profiles")
    .select("id, status")
    .eq("worker_id", workerId)
    .maybeSingle();

  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });
  if (!profile) return NextResponse.json({ error: "档案不存在" }, { status: 404 });

  const newStatus = action === "approve" ? "approved" : "rejected";
  const updates: Record<string, unknown> = {
    status: newStatus,
    reviewed_by: sess.id,
    reviewed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  if (action === "reject") {
    updates.reject_reason = reject_reason || "未通过审核";
  } else {
    updates.reject_reason = null;
    updates.admission_status = "training";
  }

  const { data, error } = await client
    .from("worker_profiles")
    .update(updates)
    .eq("worker_id", workerId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ profile: data });
}

// POST /api/worker-profiles/[workerId]/qrcode 生成二维码
export async function PUT(_request: NextRequest, { params }: Params) {
  const sess = await requireSession();
  if (!sess) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { workerId } = await params;
  const client = db();

  // 检查档案状态
  const { data: profile } = await client
    .from("worker_profiles")
    .select("id, status, admission_status")
    .eq("worker_id", workerId)
    .maybeSingle();

  if (!profile) return NextResponse.json({ error: "档案不存在" }, { status: 404 });
  if (profile.status !== "approved") {
    return NextResponse.json({ error: "档案未审核通过，无法生成二维码" }, { status: 400 });
  }

  // 生成二维码内容 - 指向扫码查询页面
  const domain = process.env.COZE_PROJECT_DOMAIN_DEFAULT || "localhost";
  const qrContent = `${domain}/worker/${workerId}`;

  try {
    const qrDataURL = await QRCode.toDataURL(qrContent, {
      width: 400,
      margin: 2,
      color: { dark: "#000000", light: "#ffffff" },
    });

    // 更新数据库
    const { data, error } = await client
      .from("worker_profiles")
      .update({
        qr_code_url: qrDataURL, // 存储 base64 data URL
        qr_code_generated: true,
        updated_at: new Date().toISOString(),
      })
      .eq("worker_id", workerId)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ profile: data, qr_code: qrDataURL });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `二维码生成失败: ${msg}` }, { status: 500 });
  }
}
