import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import {
  encryptSensitive,
  decryptSensitive,
  maskIdCard,
  maskPhone,
  stableHash,
  isValidIdCard,
  extractBirthYear,
  extractGender,
} from "@/lib/crypto";

export const runtime = "nodejs";

interface WorkerPayload {
  name?: string;
  id_card?: string;
  phone?: string | null;
  work_type?: string | null;
  project_id?: string | null;
  team_id?: string | null;
  hire_date?: string | null;
  leave_date?: string | null;
  status?: string;
  emergency_contact?: string | null;
  emergency_phone?: string | null;
  health_cert_expires_at?: string | null;
  remark?: string | null;
}

function normalizeStatus(s: unknown): string {
  const v = typeof s === "string" ? s.trim() : "active";
  return ["active", "left", "transferred"].includes(v) ? v : "active";
}

interface WorkerRow {
  id: string;
  name: string;
  gender: string | null;
  birth_year: number | null;
  phone: string | null;
  id_card_mask: string;
  work_type: string | null;
  project_id: string | null;
  team_id: string | null;
  hire_date: string | null;
  leave_date: string | null;
  status: string;
  emergency_contact: string | null;
  emergency_phone: string | null;
  health_cert_expires_at: string | null;
  remark: string | null;
  created_at: string;
  updated_at: string;
}

// GET /api/workers?project_id=&team_id=&work_type=&status=&keyword=&page=&size=
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const url = new URL(request.url);
  const projectId = url.searchParams.get("project_id");
  const teamId = url.searchParams.get("team_id");
  const workType = url.searchParams.get("work_type");
  const status = url.searchParams.get("status");
  const keyword = (url.searchParams.get("keyword") || "").trim();
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10) || 1);
  const size = Math.min(200, Math.max(10, parseInt(url.searchParams.get("size") || "50", 10) || 50));

  const client = db();
  let query = client
    .from("workers")
    .select(
      "id, name, gender, birth_year, phone, id_card_mask, work_type, project_id, team_id, hire_date, leave_date, status, emergency_contact, emergency_phone, health_cert_expires_at, remark, created_at, updated_at",
      { count: "exact" },
    )
    .order("created_at", { ascending: false });

  if (projectId) query = query.eq("project_id", projectId);
  if (teamId) query = query.eq("team_id", teamId);
  if (workType) query = query.eq("work_type", workType);
  if (status && status !== "all") query = query.eq("status", status);

  if (keyword) {
    // 支持身份证号后 4 位或姓名/手机号搜索
    if (/^[0-9]{4}$/.test(keyword)) {
      query = query.ilike("id_card_mask", `%${keyword}`);
    } else if (isValidIdCard(keyword)) {
      const h = stableHash(keyword.trim());
      query = query.eq("id_card_hash", h);
    } else {
      query = query.or(`name.ilike.%${keyword}%,phone.ilike.%${keyword}%`);
    }
  }

  const from = (page - 1) * size;
  query = query.range(from, from + size - 1);

  const { data, count, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []) as WorkerRow[];
  const projectIds = Array.from(new Set(rows.map((r) => r.project_id).filter(Boolean))) as string[];
  const teamIds = Array.from(new Set(rows.map((r) => r.team_id).filter(Boolean))) as string[];
  const [projectMap, teamMap] = await Promise.all([
    projectIds.length
      ? client
          .from("projects")
          .select("id, name")
          .in("id", projectIds)
          .then(({ data: pd }) => {
            const m: Record<string, string> = {};
            for (const r of pd ?? []) {
              const row = r as { id: string; name: string };
              m[row.id] = row.name;
            }
            return m;
          })
      : Promise.resolve({} as Record<string, string>),
    teamIds.length
      ? client
          .from("teams")
          .select("id, name")
          .in("id", teamIds)
          .then(({ data: td }) => {
            const m: Record<string, string> = {};
            for (const r of td ?? []) {
              const row = r as { id: string; name: string };
              m[row.id] = row.name;
            }
            return m;
          })
      : Promise.resolve({} as Record<string, string>),
  ]);

  const items = rows.map((r) => ({
    ...r,
    phone_mask: r.phone ? maskPhone(r.phone) : null,
    project_name: r.project_id ? projectMap[r.project_id] ?? "" : "",
    team_name: r.team_id ? teamMap[r.team_id] ?? "" : "",
  }));

  return NextResponse.json({ items, total: count ?? items.length, page, size });
}

// POST /api/workers
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });

  let body: WorkerPayload;
  try {
    body = (await request.json()) as WorkerPayload;
  } catch {
    return NextResponse.json({ error: "请求体解析失败" }, { status: 400 });
  }

  const name = (body.name || "").trim();
  const idCard = (body.id_card || "").trim().toUpperCase();
  if (!name) return NextResponse.json({ error: "姓名必填" }, { status: 400 });
  if (!isValidIdCard(idCard)) return NextResponse.json({ error: "身份证号格式不正确" }, { status: 400 });

  const client = db();
  const idHash = stableHash(idCard);

  // 去重校验
  const { data: exist } = await client
    .from("workers")
    .select("id, name")
    .eq("id_card_hash", idHash)
    .maybeSingle();
  if (exist) {
    return NextResponse.json({ error: `该身份证号已存在（${(exist as { name: string }).name}）` }, { status: 409 });
  }

  const insertRow = {
    name,
    gender: extractGender(idCard),
    birth_year: extractBirthYear(idCard),
    phone: body.phone ? body.phone.trim() : null,
    id_card_encrypted: encryptSensitive(idCard),
    id_card_hash: idHash,
    id_card_mask: maskIdCard(idCard),
    work_type: body.work_type ? body.work_type.trim() : null,
    project_id: body.project_id || null,
    team_id: body.team_id || null,
    hire_date: body.hire_date || null,
    leave_date: body.leave_date || null,
    status: normalizeStatus(body.status),
    emergency_contact: body.emergency_contact ? body.emergency_contact.trim() : null,
    emergency_phone: body.emergency_phone ? body.emergency_phone.trim() : null,
    health_cert_expires_at: body.health_cert_expires_at || null,
    remark: body.remark || null,
  };

  const { data, error } = await client.from("workers").insert(insertRow).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // 顺手更新班组人数缓存（不阻塞，静默失败）
  if (insertRow.team_id) {
    try {
      await client.rpc("noop");
    } catch {
      /* 占位：后续可挂钩 team 人数刷新 */
    }
  }

  // 主动屏蔽 encrypted 字段
  const safe = { ...(data as WorkerRow), id_card_encrypted: undefined };
  return NextResponse.json({ item: safe });
}

// 支持查看单人明文身份证的接口独立在 [id]/reveal 里，本文件不返回明文
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _unusedDecrypt = decryptSensitive;
