import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import {
  encryptSensitive,
  decryptSensitive,
  maskIdCard,
  stableHash,
  isValidIdCard,
  extractBirthYear,
  extractGender,
  maskPhone,
} from "@/lib/crypto";

export const runtime = "nodejs";

interface UpdateBody {
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

function normalizeStatus(s: unknown): string | undefined {
  if (typeof s !== "string") return undefined;
  const v = s.trim();
  return ["active", "left", "transferred"].includes(v) ? v : undefined;
}

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const url = new URL(request.url);
  const reveal = url.searchParams.get("reveal") === "1";

  const client = db();
  const { data, error } = await client.from("workers").select("*").eq("id", id).single();
  if (error || !data) return NextResponse.json({ error: "工人不存在" }, { status: 404 });

  const row = data as {
    id: string;
    name: string;
    phone: string | null;
    id_card_encrypted: string;
    id_card_mask: string;
    id_card_hash: string;
    project_id: string | null;
    team_id: string | null;
  } & Record<string, unknown>;

  // 关联项目/班组名
  const [projRes, teamRes] = await Promise.all([
    row.project_id ? client.from("projects").select("id, name").eq("id", row.project_id).maybeSingle() : Promise.resolve({ data: null }),
    row.team_id ? client.from("teams").select("id, name").eq("id", row.team_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);

  const item: Record<string, unknown> = {
    ...row,
    id_card_encrypted: undefined,
    phone_mask: row.phone ? maskPhone(row.phone) : null,
    project_name: (projRes.data as { name?: string } | null)?.name ?? "",
    team_name: (teamRes.data as { name?: string } | null)?.name ?? "",
  };

  if (reveal && session.role === "admin") {
    item.id_card = decryptSensitive(row.id_card_encrypted);
  }
  return NextResponse.json({ item });
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

  const client = db();
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (body.name !== undefined) {
    const n = body.name.trim();
    if (!n) return NextResponse.json({ error: "姓名不能为空" }, { status: 400 });
    patch.name = n;
  }
  if (body.id_card !== undefined && body.id_card) {
    const idCard = body.id_card.trim().toUpperCase();
    if (!isValidIdCard(idCard)) return NextResponse.json({ error: "身份证号格式不正确" }, { status: 400 });
    const idHash = stableHash(idCard);
    // 判重（自己除外）
    const { data: dup } = await client
      .from("workers")
      .select("id, name")
      .eq("id_card_hash", idHash)
      .neq("id", id)
      .maybeSingle();
    if (dup) return NextResponse.json({ error: `身份证号与已有工人重复（${(dup as { name: string }).name}）` }, { status: 409 });
    patch.id_card_encrypted = encryptSensitive(idCard);
    patch.id_card_hash = idHash;
    patch.id_card_mask = maskIdCard(idCard);
    patch.gender = extractGender(idCard);
    patch.birth_year = extractBirthYear(idCard);
  }
  if (body.phone !== undefined) patch.phone = body.phone ? String(body.phone).trim() : null;
  if (body.work_type !== undefined) patch.work_type = body.work_type ? String(body.work_type).trim() : null;
  if (body.project_id !== undefined) patch.project_id = body.project_id || null;
  if (body.team_id !== undefined) patch.team_id = body.team_id || null;
  if (body.hire_date !== undefined) patch.hire_date = body.hire_date || null;
  if (body.leave_date !== undefined) patch.leave_date = body.leave_date || null;
  if (body.status !== undefined) {
    const s = normalizeStatus(body.status);
    if (!s) return NextResponse.json({ error: "状态非法" }, { status: 400 });
    patch.status = s;
  }
  if (body.emergency_contact !== undefined) patch.emergency_contact = body.emergency_contact || null;
  if (body.emergency_phone !== undefined) patch.emergency_phone = body.emergency_phone || null;
  if (body.health_cert_expires_at !== undefined) patch.health_cert_expires_at = body.health_cert_expires_at || null;
  if (body.remark !== undefined) patch.remark = body.remark || null;

  const { data, error } = await client.from("workers").update(patch).eq("id", id).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const safe = { ...(data as Record<string, unknown>), id_card_encrypted: undefined };
  return NextResponse.json({ item: safe });
}

export async function DELETE(_request: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const client = db();
  const { error } = await client.from("workers").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
