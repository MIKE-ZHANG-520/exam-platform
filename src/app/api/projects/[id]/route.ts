import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";

export const runtime = "nodejs";

interface UpdateBody {
  name?: string;
  code?: string | null;
  location?: string | null;
  manager?: string | null;
  manager_phone?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  status?: string;
  description?: string | null;
}

function normalizeStatus(s: unknown): string | undefined {
  if (typeof s !== "string") return undefined;
  const v = s.trim();
  return ["active", "paused", "finished", "archived"].includes(v) ? v : undefined;
}

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const client = db();
  const { data: project, error } = await client.from("projects").select("*").eq("id", id).single();
  if (error || !project) return NextResponse.json({ error: "项目不存在" }, { status: 404 });

  const [{ data: teams }, { data: workers }] = await Promise.all([
    client.from("teams").select("*").eq("project_id", id).order("created_at", { ascending: false }),
    client.from("workers").select("id, status").eq("project_id", id),
  ]);

  const active = (workers ?? []).filter((w) => (w as { status: string }).status === "active").length;
  return NextResponse.json({
    item: {
      ...project,
      team_count: (teams ?? []).length,
      worker_count: active,
      worker_total: (workers ?? []).length,
      teams: teams ?? [],
    },
  });
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
  if (typeof body.name === "string") {
    const name = body.name.trim();
    if (!name) return NextResponse.json({ error: "项目名称不能为空" }, { status: 400 });
    patch.name = name;
  }
  if (body.code !== undefined) patch.code = body.code ? String(body.code).trim() : null;
  if (body.location !== undefined) patch.location = body.location ? String(body.location).trim() : null;
  if (body.manager !== undefined) patch.manager = body.manager ? String(body.manager).trim() : null;
  if (body.manager_phone !== undefined) patch.manager_phone = body.manager_phone ? String(body.manager_phone).trim() : null;
  if (body.start_date !== undefined) patch.start_date = body.start_date || null;
  if (body.end_date !== undefined) patch.end_date = body.end_date || null;
  if (body.status !== undefined) {
    const s = normalizeStatus(body.status);
    if (!s) return NextResponse.json({ error: "状态非法" }, { status: 400 });
    patch.status = s;
  }
  if (body.description !== undefined) patch.description = body.description || null;

  const client = db();
  const { data, error } = await client.from("projects").update(patch).eq("id", id).select("*").single();
  if (error) {
    if (error.code === "23505") return NextResponse.json({ error: "项目编号已存在" }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ item: data });
}

export async function DELETE(_request: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const client = db();
  // 校验：如有在册工人，禁止删除，让用户先转移或停用工人
  const { count } = await client.from("workers").select("id", { count: "exact", head: true }).eq("project_id", id).eq("status", "active");
  if ((count ?? 0) > 0) {
    return NextResponse.json({ error: `尚有 ${count} 名在册工人，请先转移或停用后再删除` }, { status: 400 });
  }

  const { error } = await client.from("projects").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
