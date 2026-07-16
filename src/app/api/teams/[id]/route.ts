import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";

export const runtime = "nodejs";

interface UpdateBody {
  project_id?: string;
  name?: string;
  leader?: string | null;
  leader_phone?: string | null;
  main_work_type?: string | null;
  status?: string;
  description?: string | null;
}

function normalizeStatus(s: unknown): string | undefined {
  if (typeof s !== "string") return undefined;
  const v = s.trim();
  return ["active", "disbanded"].includes(v) ? v : undefined;
}

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const client = db();
  const { data, error } = await client.from("teams").select("*").eq("id", id).single();
  if (error || !data) return NextResponse.json({ error: "班组不存在" }, { status: 404 });
  return NextResponse.json({ item: data });
}

export async function PATCH(request: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });

  let body: UpdateBody;
  try {
    body = (await request.json()) as UpdateBody;
  } catch {
    return NextResponse.json({ error: "请求体解析失败" }, { status: 400 });
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.project_id !== undefined) {
    const pid = String(body.project_id).trim();
    if (!pid) return NextResponse.json({ error: "所属项目不能为空" }, { status: 400 });
    patch.project_id = pid;
  }
  if (body.name !== undefined) {
    const n = body.name.trim();
    if (!n) return NextResponse.json({ error: "班组名称不能为空" }, { status: 400 });
    patch.name = n;
  }
  if (body.leader !== undefined) patch.leader = body.leader ? String(body.leader).trim() : null;
  if (body.leader_phone !== undefined) patch.leader_phone = body.leader_phone ? String(body.leader_phone).trim() : null;
  if (body.main_work_type !== undefined) patch.main_work_type = body.main_work_type ? String(body.main_work_type).trim() : null;
  if (body.status !== undefined) {
    const s = normalizeStatus(body.status);
    if (!s) return NextResponse.json({ error: "状态非法" }, { status: 400 });
    patch.status = s;
  }
  if (body.description !== undefined) patch.description = body.description || null;

  const client = db();
  const { data, error } = await client.from("teams").update(patch).eq("id", id).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item: data });
}

export async function DELETE(_request: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const client = db();
  const { count } = await client.from("workers").select("id", { count: "exact", head: true }).eq("team_id", id).eq("status", "active");
  if ((count ?? 0) > 0) {
    return NextResponse.json({ error: `班组内尚有 ${count} 名在册工人，请先调整后再删除` }, { status: 400 });
  }
  const { error } = await client.from("teams").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
