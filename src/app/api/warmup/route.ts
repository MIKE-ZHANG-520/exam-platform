import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 唤醒 FaaS 冷启动实例，无鉴权、无副作用、极轻量。
// 前端在发起长任务前主动调用一次，避免用户请求撞冷启动。
export async function POST() {
  return NextResponse.json({ ok: true, ts: Date.now() });
}

export async function GET() {
  return NextResponse.json({ ok: true, ts: Date.now() });
}
