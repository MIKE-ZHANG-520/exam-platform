import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin, requireTrainerOrAbove } from "@/lib/auth";
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

// GET /api/workers?project_id=&team_id=&work_type=&status=&keyword=&page=&size=&search=&worker_id=
export async function GET(request: NextRequest) {
  try {
    await requireTrainerOrAbove();
  } catch {
    return NextResponse.json({ error: "无权限，仅管理员和培训主管可访问" }, { status: 403 });
  }

  const url = new URL(request.url);
  const projectId = url.searchParams.get("project_id");
  const teamId = url.searchParams.get("team_id");
  const workType = url.searchParams.get("work_type");
  const status = url.searchParams.get("status");
  const keyword = (url.searchParams.get("keyword") || url.searchParams.get("search") || "").trim();
  const workerId = url.searchParams.get("worker_id");
  const admissionStatus = url.searchParams.get("admission_status");
  const profileStatus = url.searchParams.get("status");
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10) || 1);
  const size = Math.min(200, Math.max(10, parseInt(url.searchParams.get("size") || "50", 10) || 50));

  const client = db();

  // 如果指定了 worker_id，直接查询单个工人
  if (workerId) {
    const { data, error } = await client
      .from("workers")
      .select("id, name, gender, birth_year, phone, work_type, team_id, teams(name)")
      .eq("id", workerId)
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ items: [], total: 0 });

    return NextResponse.json({ items: [data], total: 1 });
  }

  let query = client
    .from("workers")
    .select(
      "id, name, gender, birth_year, phone, id_card_mask, work_type, project_id, team_id, hire_date, leave_date, status, emergency_contact, emergency_phone, health_cert_expires_at, remark, created_at, updated_at, teams(name)",
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

  const rows = (data ?? []) as unknown as Array<WorkerRow & { teams?: { name: string } | null }>;
  const workerIds = rows.map((r) => r.id);

  // 获取工人档案信息
  const profileMap: Record<string, {
    id: string;
    status: string;
    admission_status: string;
    qr_code_generated: boolean;
    special_cert_type: string | null;
    special_cert_expire_date: string | null;
  }> = {};

  if (workerIds.length > 0) {
    const { data: profiles } = await client
      .from("worker_profiles")
      .select("id, worker_id, status, admission_status, qr_code_generated, special_cert_type, special_cert_expire_date")
      .in("worker_id", workerIds);

    if (profiles) {
      for (const p of profiles) {
        profileMap[p.worker_id] = {
          id: p.id,
          status: p.status,
          admission_status: p.admission_status,
          qr_code_generated: p.qr_code_generated,
          special_cert_type: p.special_cert_type,
          special_cert_expire_date: p.special_cert_expire_date,
        };
      }
    }
  }

  // 根据档案状态筛选
  let filteredRows = rows;
  if (admissionStatus && admissionStatus !== "all") {
    filteredRows = rows.filter((r) => {
      const profile = profileMap[r.id];
      const actualStatus = profile?.admission_status || "not_started";
      return actualStatus === admissionStatus;
    });
  }
  if (profileStatus && profileStatus !== "all") {
    filteredRows = rows.filter((r) => {
      const profile = profileMap[r.id];
      const actualStatus = profile?.status || "not_created";
      return actualStatus === profileStatus;
    });
  }

  const items = filteredRows.map((r) => ({
    ...r,
    phone_mask: r.phone ? maskPhone(r.phone) : null,
    profile: profileMap[r.id] || null,
  }));

  return NextResponse.json({ items, total: count ?? items.length, page, size });
}

// POST /api/workers
export async function POST(request: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "无权限，仅管理员可操作" }, { status: 403 });
  }

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
