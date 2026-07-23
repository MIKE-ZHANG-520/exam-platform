import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { db } from "@/lib/db";
import { requireAdmin, getSession } from "@/lib/auth";
import {
  encryptSensitive,
  maskIdCard,
  stableHash,
  isValidIdCard,
  extractBirthYear,
  extractGender,
} from "@/lib/crypto";
import { logOperation, getClientIp, getUserAgent, OperationAction } from "@/lib/operation-log";

export const runtime = "nodejs";
export const maxDuration = 30;

interface ImportRowResult {
  row: number;
  name?: string;
  status: "success" | "duplicate" | "invalid" | "error";
  reason?: string;
}

interface WorkerData {
  name: string;
  id_card: string;
  phone?: string;
  team_name?: string;
  work_type?: string;
  hire_date?: string;
}

// 列名映射：支持中英文、常见别名
const COLUMN_ALIASES: Record<string, string[]> = {
  name: ["姓名", "名字", "工人姓名", "人员姓名", "name", "worker name", "employee name"],
  id_card: ["身份证号", "身份证", "证件号", "身份证号", "id card", "id number", "identity"],
  phone: ["手机号", "电话", "联系电话", "手机号码", "phone", "mobile", "tel"],
  gender: ["性别", "gender", "sex"],
  work_type: ["工种", "岗位", "职务", "职位", "work type", "job", "position", "role"],
  team_name: ["班组", "班组名称", "班组（工种）", "施工班组", "team", "group", "department"],
  project: ["项目", "项目名称", "工程", "project"],
  hire_date: ["入职日期", "入职时间", "进场日期", "入职", "hire date", "join date", "start date"],
  status: ["状态", "人员状态", "status"],
};

// 根据表头名称匹配字段
function matchColumn(header: string): string | null {
  const normalized = header.trim().toLowerCase();
  for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
    for (const alias of aliases) {
      if (normalized === alias.toLowerCase()) {
        return field;
      }
    }
    // 模糊匹配：包含关键词
    for (const alias of aliases) {
      if (normalized.includes(alias.toLowerCase()) || alias.toLowerCase().includes(normalized)) {
        return field;
      }
    }
  }
  return null;
}

// 查找表头行（前10行中找）
function findHeaderRow(rows: unknown[][]): { headerIdx: number; colMap: Record<number, string> } | null {
  for (let i = 0; i < Math.min(10, rows.length); i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;
    
    const colMap: Record<number, string> = {};
    let matchCount = 0;
    
    for (let c = 0; c < row.length; c++) {
      const cell = String(row[c] ?? "").trim();
      if (!cell) continue;
      
      const field = matchColumn(cell);
      if (field) {
        colMap[c] = field;
        matchCount++;
      }
    }
    
    // 至少匹配3个关键字段才认为是表头，且必须包含"姓名"字段
    if (matchCount >= 3 && Object.values(colMap).includes("name")) {
      return { headerIdx: i, colMap };
    }
  }
  return null;
}

// 从行数据提取工人信息
function extractWorker(row: unknown[], colMap: Record<number, string>): WorkerData | null {
  const data: Record<string, string> = {};
  
  for (const [colIdx, field] of Object.entries(colMap)) {
    const value = String(row[Number(colIdx)] ?? "").trim();
    data[field] = value;
  }
  
  // 必须有姓名和身份证号
  if (!data.name || !data.id_card) return null;
  
  return {
    name: data.name,
    id_card: data.id_card,
    phone: data.phone || "",
    team_name: data.team_name || "",
    work_type: data.work_type || "",
    hire_date: data.hire_date || "",
  };
}

// POST /api/workers/import (multipart/form-data: file, project_id, team_id)
export async function POST(request: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "无权限，仅管理员可操作" }, { status: 403 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "解析表单失败" }, { status: 400 });
  }
  const file = formData.get("file") as File | null;
  const projectId = ((formData.get("project_id") as string | null) || "").trim();
  const teamIdInput = ((formData.get("team_id") as string | null) || "").trim();

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

  // 处理合并单元格
  const merges = sheet["!merges"] || [];
  for (const merge of merges) {
    const startCell = XLSX.utils.encode_cell({ r: merge.s.r, c: merge.s.c });
    const startValue = sheet[startCell]?.v;
    if (startValue !== undefined) {
      for (let r = merge.s.r; r <= merge.e.r; r++) {
        for (let c = merge.s.c; c <= merge.e.c; c++) {
          const cell = XLSX.utils.encode_cell({ r, c });
          if (!sheet[cell]) {
            sheet[cell] = { t: "s", v: String(startValue) };
          }
        }
      }
    }
  }

  // 读取所有行
  const rawRows: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    blankrows: true,
    defval: "",
  }) as unknown[][];

  if (rawRows.length < 2) {
    return NextResponse.json({ error: "表格中未找到数据行" }, { status: 400 });
  }

  // 查找表头行
  const headerResult = findHeaderRow(rawRows);
  if (!headerResult) {
    return NextResponse.json({
      error: "无法识别表头，请确保表格包含「姓名」「身份证号」等列名",
    }, { status: 400 });
  }

  const { headerIdx, colMap } = headerResult;
  const dataRows = rawRows.slice(headerIdx + 1);

  // 提取工人数据
  const workersData: WorkerData[] = [];
  for (const row of dataRows) {
    if (!row || row.every((c) => !c || String(c).trim() === "")) continue;
    const worker = extractWorker(row, colMap);
    if (worker) workersData.push(worker);
  }

  if (workersData.length === 0) {
    return NextResponse.json({ error: "未能从表格中提取到有效的工人数据" }, { status: 400 });
  }

  const client = db();

  // 班组名称 -> id 映射
  const { data: teamsData } = await client.from("teams").select("id, name");
  const teamNameMap: Record<string, string> = {};
  for (const t of (teamsData ?? []) as { id: string; name: string }[]) {
    teamNameMap[t.name] = t.id;
  }

  const results: ImportRowResult[] = [];
  const validPayloads: Record<string, unknown>[] = [];
  const seenHash = new Set<string>();

  for (let i = 0; i < workersData.length; i++) {
    const worker = workersData[i];
    const rowNo = headerIdx + 2 + i; // Excel 行号

    const name = (worker.name || "").trim();
    const idCard = (worker.id_card || "").trim().toUpperCase();

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

    const teamName = (worker.team_name || "").trim();
    const teamId = teamIdInput || (teamName ? teamNameMap[teamName] : undefined) || null;

    const payload = {
      name,
      gender: extractGender(idCard),
      birth_year: extractBirthYear(idCard),
      phone: (worker.phone || "").trim() || null,
      id_card_encrypted: encryptSensitive(idCard),
      id_card_hash: idHash,
      id_card_mask: maskIdCard(idCard),
      work_type: (worker.work_type || "").trim() || null,
      project_id: projectId || null,
      team_id: teamId,
      hire_date: (worker.hire_date || "").trim() || null,
      status: "active" as const,
      emergency_contact: null,
      emergency_phone: null,
      health_cert_expires_at: null,
      remark: null,
    };

    validPayloads.push(payload);
    results.push({ row: rowNo, name, status: "success" });
  }

  // 数据库层面去重
  let insertedCount = 0;
  let dbDuplicateCount = 0;
  if (validPayloads.length > 0) {
    const hashes = validPayloads.map((p) => String(p.id_card_hash));
    const { data: existRows } = await client
      .from("workers")
      .select("id_card_hash, name")
      .in("id_card_hash", hashes);
    const existSet = new Set((existRows ?? []).map((r) => String(r.id_card_hash)));
    const existNameMap: Record<string, string> = {};
    for (const r of (existRows ?? []) as { id_card_hash: string; name: string }[]) {
      existNameMap[String(r.id_card_hash)] = r.name;
    }
    const toInsert = validPayloads.filter((p) => {
      const h = String(p.id_card_hash);
      if (existSet.has(h)) {
        dbDuplicateCount += 1;
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
      const { error } = await client.from("workers").insert(toInsert);
      if (error) {
        return NextResponse.json({ error: `批量写入失败：${error.message}` }, { status: 500 });
      }
      insertedCount = toInsert.length;
    }
  }

  // 返回前端期望的格式
  const errors = results
    .filter((r) => r.status !== "success")
    .map((r) => ({ row: r.row, reason: r.reason || "" }));

  // 记录导入日志
  const session = await getSession().catch(() => null);
  if (session) {
    logOperation({
      userId: session.id,
      userName: session.real_name || session.username,
      action: OperationAction.WORKER_IMPORT,
      targetType: "workers",
      detail: { file_name: file.name, total: workersData.length, success: insertedCount, skipped: results.filter((r) => r.status !== "success").length },
      ipAddress: getClientIp(request),
      userAgent: getUserAgent(request),
    });
  }

  return NextResponse.json({
    total: workersData.length,
    success: insertedCount,
    updated: 0,
    skipped: results.filter((r) => r.status !== "success").length,
    errors,
  });
}
