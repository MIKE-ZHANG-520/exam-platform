import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";

export const runtime = "nodejs";

interface ProjectPayload {
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

function normalizeStatus(s: unknown): string {
  const v = typeof s === "string" ? s.trim() : "active";
  if (["active", "paused", "finished", "archived"].includes(v)) return v;
  return "active";
}

// GET /api/projects?status=&keyword=
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const keyword = (url.searchParams.get("keyword") || "").trim();

  const client = db();
  let query = client
    .from("projects")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500);

  if (status && status !== "all") query = query.eq("status", status);
  if (keyword) query = query.or(`name.ilike.%${keyword}%,code.ilike.%${keyword}%,location.ilike.%${keyword}%`);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // 计算每个项目下的班组数与工人数
  const projectIds = (data ?? []).map((p: { id: string }) => p.id);
  const stats: Record<string, { team_count: number; worker_count: number }> = {};
  if (projectIds.length > 0) {
    const [{ data: teamRows }, { data: workerRows }] = await Promise.all([
      client.from("teams").select("project_id").in("project_id", projectIds),
      client.from("workers").select("project_id").in("project_id", projectIds).eq("status", "active"),
    ]);
    for (const row of teamRows ?? []) {
      const pid = String((row as { project_id: string }).project_id);
      stats[pid] = stats[pid] ?? { team_count: 0, worker_count: 0 };
      stats[pid].team_count += 1;
    }
    for (const row of workerRows ?? []) {
      const pid = String((row as { project_id: string }).project_id);
      stats[pid] = stats[pid] ?? { team_count: 0, worker_count: 0 };
      stats[pid].worker_count += 1;
    }
  }

  const items = (data ?? []).map((p: { id: string }) => ({
    ...p,
    team_count: stats[p.id]?.team_count ?? 0,
    worker_count: stats[p.id]?.worker_count ?? 0,
  }));

  return NextResponse.json({ items });
}

// POST /api/projects
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });

  let body: ProjectPayload;
  try {
    body = (await request.json()) as ProjectPayload;
  } catch {
    return NextResponse.json({ error: "请求体解析失败" }, { status: 400 });
  }

  const name = (body.name || "").trim();
  if (!name) return NextResponse.json({ error: "项目名称必填" }, { status: 400 });

  const client = db();
  const insertRow = {
    name,
    code: body.code ? body.code.trim() : null,
    location: body.location ? body.location.trim() : null,
    manager: body.manager ? body.manager.trim() : null,
    manager_phone: body.manager_phone ? body.manager_phone.trim() : null,
    start_date: body.start_date || null,
    end_date: body.end_date || null,
    status: normalizeStatus(body.status),
    description: body.description || null,
    owner_id: session.id,
  };

  const { data, error } = await client
    .from("projects")
    .insert(insertRow)
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") return NextResponse.json({ error: "项目编号已存在" }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ item: data });
}
