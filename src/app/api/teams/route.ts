import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";

export const runtime = "nodejs";

interface TeamPayload {
  project_id?: string;
  name?: string;
  leader?: string | null;
  leader_phone?: string | null;
  main_work_type?: string | null;
  status?: string;
  description?: string | null;
}

function normalizeStatus(s: unknown): string {
  const v = typeof s === "string" ? s.trim() : "active";
  return ["active", "disbanded"].includes(v) ? v : "active";
}

// GET /api/teams?project_id=xxx&status=&keyword=
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const url = new URL(request.url);
  const projectId = url.searchParams.get("project_id");
  const status = url.searchParams.get("status");
  const keyword = (url.searchParams.get("keyword") || "").trim();

  const client = db();
  let query = client
    .from("teams")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1000);

  if (projectId) query = query.eq("project_id", projectId);
  if (status && status !== "all") query = query.eq("status", status);
  if (keyword) query = query.or(`name.ilike.%${keyword}%,leader.ilike.%${keyword}%,main_work_type.ilike.%${keyword}%`);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // 关联项目名 + 实时工人数
  const teamRows = (data ?? []) as Array<{ id: string; project_id: string }>;
  const projectIds = Array.from(new Set(teamRows.map((t) => t.project_id).filter(Boolean)));
  const teamIds = teamRows.map((t) => t.id);

  const [projectMap, workerCounts] = await Promise.all([
    projectIds.length
      ? client
          .from("projects")
          .select("id, name, status")
          .in("id", projectIds)
          .then(({ data: rows }) => {
            const m: Record<string, { name: string; status: string }> = {};
            for (const r of rows ?? []) {
              const row = r as { id: string; name: string; status: string };
              m[row.id] = { name: row.name, status: row.status };
            }
            return m;
          })
      : Promise.resolve({} as Record<string, { name: string; status: string }>),
    teamIds.length
      ? client
          .from("workers")
          .select("team_id")
          .in("team_id", teamIds)
          .eq("status", "active")
          .then(({ data: rows }) => {
            const m: Record<string, number> = {};
            for (const r of rows ?? []) {
              const tid = String((r as { team_id: string }).team_id);
              m[tid] = (m[tid] ?? 0) + 1;
            }
            return m;
          })
      : Promise.resolve({} as Record<string, number>),
  ]);

  const items = teamRows.map((t) => ({
    ...t,
    project_name: projectMap[t.project_id]?.name ?? "",
    project_status: projectMap[t.project_id]?.status ?? "",
    active_worker_count: workerCounts[t.id] ?? 0,
  }));

  return NextResponse.json({ items });
}

// POST /api/teams
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });

  let body: TeamPayload;
  try {
    body = (await request.json()) as TeamPayload;
  } catch {
    return NextResponse.json({ error: "请求体解析失败" }, { status: 400 });
  }

  const projectId = (body.project_id || "").trim();
  const name = (body.name || "").trim();
  if (!projectId) return NextResponse.json({ error: "所属项目必选" }, { status: 400 });
  if (!name) return NextResponse.json({ error: "班组名称必填" }, { status: 400 });

  const client = db();
  const { data: proj } = await client.from("projects").select("id").eq("id", projectId).single();
  if (!proj) return NextResponse.json({ error: "项目不存在" }, { status: 400 });

  const insertRow = {
    project_id: projectId,
    name,
    leader: body.leader ? body.leader.trim() : null,
    leader_phone: body.leader_phone ? body.leader_phone.trim() : null,
    main_work_type: body.main_work_type ? body.main_work_type.trim() : null,
    status: normalizeStatus(body.status),
    description: body.description || null,
    member_count: 0,
  };
  const { data, error } = await client.from("teams").insert(insertRow).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item: data });
}
