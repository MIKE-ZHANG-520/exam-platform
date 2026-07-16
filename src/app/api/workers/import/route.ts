import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import {
  encryptSensitive,
  maskIdCard,
  stableHash,
  isValidIdCard,
  extractBirthYear,
  extractGender,
} from "@/lib/crypto";

export const runtime = "nodejs";
export const maxDuration = 60;

// 表头智能识别：常见中英文列名 → 内部字段
const HEADER_ALIASES: Record<string, string[]> = {
  name: ["姓名", "工人姓名", "员工姓名", "name", "worker_name", "full_name", "员工"],
  id_card: [
    "身份证号",
    "身份证",
    "身份证号码",
    "证件号",
    "证件号码",
    "id_card",
    "idcard",
    "id",
    "id_number",
  ],
  phone: ["手机号", "手机", "电话", "联系电话", "phone", "mobile", "tel"],
  work_type: ["工种", "岗位", "工种类型", "work_type", "job", "role", "position"],
  team_name: ["班组", "所属班组", "team", "team_name", "group"],
  hire_date: ["入职日期", "入职时间", "hire_date", "join_date", "start_date"],
  emergency_contact: ["紧急联系人", "紧急联系人姓名", "emergency_contact"],
  emergency_phone: ["紧急联系人电话", "紧急联系电话", "emergency_phone"],
  health_cert_expires_at: ["健康证有效期", "健康证到期", "health_cert_expires_at", "health_cert_expiry"],
  remark: ["备注", "说明", "remark", "note", "comment"],
};

// 归一化表头文本
function normalizeHeader(h: string): string {
  return h
    .replace(/[\s\u3000]/g, "")
    .replace(/[（）()]/g, "")
    .toLowerCase();
}

function matchHeader(headers: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  headers.forEach((h, idx) => {
    const norm = normalizeHeader(String(h || ""));
    for (const [key, aliases] of Object.entries(HEADER_ALIASES)) {
      if (map[key] !== undefined) continue;
      for (const alias of aliases) {
        if (normalizeHeader(alias) === norm) {
          map[key] = idx;
          break;
        }
      }
    }
  });
  return map;
}

interface ImportRowResult {
  row: number;
  name?: string;
  status: "success" | "duplicate" | "invalid" | "error";
  reason?: string;
}

// POST /api/workers/import (multipart/form-data: file, project_id, dry_run)
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "解析表单失败" }, { status: 400 });
  }
  const file = formData.get("file") as File | null;
  const projectId = ((formData.get("project_id") as string | null) || "").trim();
  const teamIdInput = ((formData.get("team_id") as string | null) || "").trim();
  const dryRun = String(formData.get("dry_run") || "0") === "1";

  if (!file) return NextResponse.json({ error: "缺少文件" }, { status: 400 });

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  } catch (e: unknown) {
    return NextResponse.json({ error: `Excel 解析失败：${(e as Error).message}` }, { status: 400 });
  }

  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) return NextResponse.json({ error: "工作簿为空" }, { status: 400 });

  const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false, defval: "" });
  if (rows.length < 2) return NextResponse.json({ error: "表格中未找到数据行" }, { status: 400 });

  const headers = (rows[0] as unknown[]).map((v) => String(v ?? ""));
  const headerMap = matchHeader(headers);

  if (headerMap.name === undefined || headerMap.id_card === undefined) {
    return NextResponse.json(
      { error: "表格必须包含『姓名』和『身份证号』两列", detected_headers: headers },
      { status: 400 },
    );
  }

  const client = db();

  // 载入项目下所有班组，便于按班组名映射
  const teamNameMap: Record<string, string> = {};
  if (projectId) {
    const { data: teamRows } = await client.from("teams").select("id, name").eq("project_id", projectId);
    for (const t of teamRows ?? []) {
      const row = t as { id: string; name: string };
      teamNameMap[row.name.trim()] = row.id;
    }
  }

  const results: ImportRowResult[] = [];
  const validPayloads: Record<string, unknown>[] = [];
  const seenHash = new Set<string>();

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] as unknown[];
    const rowNo = i + 1;
    const cell = (idx: number | undefined): string => {
      if (idx === undefined) return "";
      const v = row[idx];
      if (v === null || v === undefined) return "";
      if (v instanceof Date) {
        const y = v.getFullYear();
        const m = String(v.getMonth() + 1).padStart(2, "0");
        const d = String(v.getDate()).padStart(2, "0");
        return `${y}-${m}-${d}`;
      }
      return String(v).trim();
    };

    const name = cell(headerMap.name);
    const idCard = cell(headerMap.id_card).toUpperCase();

    if (!name && !idCard) continue; // 整行空

    if (!name) {
      results.push({ row: rowNo, status: "invalid", reason: "姓名为空" });
      continue;
    }
    if (!isValidIdCard(idCard)) {
      results.push({ row: rowNo, name, status: "invalid", reason: "身份证号格式不正确" });
      continue;
    }
    const idHash = stableHash(idCard);
    if (seenHash.has(idHash)) {
      results.push({ row: rowNo, name, status: "duplicate", reason: "同批次内重复" });
      continue;
    }
    seenHash.add(idHash);

    const teamName = cell(headerMap.team_name);
    const teamId = teamIdInput || (teamName ? teamNameMap[teamName] : undefined) || null;

    const payload = {
      name,
      gender: extractGender(idCard),
      birth_year: extractBirthYear(idCard),
      phone: cell(headerMap.phone) || null,
      id_card_encrypted: encryptSensitive(idCard),
      id_card_hash: idHash,
      id_card_mask: maskIdCard(idCard),
      work_type: cell(headerMap.work_type) || null,
      project_id: projectId || null,
      team_id: teamId,
      hire_date: cell(headerMap.hire_date) || null,
      status: "active" as const,
      emergency_contact: cell(headerMap.emergency_contact) || null,
      emergency_phone: cell(headerMap.emergency_phone) || null,
      health_cert_expires_at: cell(headerMap.health_cert_expires_at) || null,
      remark: cell(headerMap.remark) || null,
    };

    validPayloads.push(payload);
    results.push({ row: rowNo, name, status: "success" });
  }

  // 数据库层面去重
  let insertedCount = 0;
  let dbDuplicateCount = 0;
  if (!dryRun && validPayloads.length > 0) {
    const hashes = validPayloads.map((p) => String(p.id_card_hash));
    const { data: existRows } = await client
      .from("workers")
      .select("id_card_hash, name")
      .in("id_card_hash", hashes);
    const existSet = new Set<string>();
    const existNameMap: Record<string, string> = {};
    for (const r of existRows ?? []) {
      const row = r as { id_card_hash: string; name: string };
      existSet.add(row.id_card_hash);
      existNameMap[row.id_card_hash] = row.name;
    }
    const toInsert = validPayloads.filter((p) => {
      const h = String(p.id_card_hash);
      if (existSet.has(h)) {
        dbDuplicateCount += 1;
        // 更新对应 result
        const target = results.find((r) => r.name === (p.name as string) && r.status === "success");
        if (target) {
          target.status = "duplicate";
          target.reason = `已存在（${existNameMap[h] ?? p.name}）`;
        }
        return false;
      }
      return true;
    });

    if (toInsert.length > 0) {
      // 分批插入避免过大
      const batchSize = 500;
      for (let i = 0; i < toInsert.length; i += batchSize) {
        const batch = toInsert.slice(i, i + batchSize);
        const { error } = await client.from("workers").insert(batch);
        if (error) {
          // 出错的批次全部标记 error
          for (const p of batch) {
            const target = results.find((r) => r.name === (p.name as string) && r.status === "success");
            if (target) {
              target.status = "error";
              target.reason = error.message;
            }
          }
        } else {
          insertedCount += batch.length;
        }
      }
    }
  }

  const summary = {
    total: rows.length - 1,
    success: dryRun ? results.filter((r) => r.status === "success").length : insertedCount,
    duplicate: results.filter((r) => r.status === "duplicate").length + (dryRun ? 0 : 0),
    invalid: results.filter((r) => r.status === "invalid").length,
    error: results.filter((r) => r.status === "error").length,
    db_duplicate: dbDuplicateCount,
    dry_run: dryRun,
    detected_headers: headerMap,
  };

  return NextResponse.json({ summary, results });
}
