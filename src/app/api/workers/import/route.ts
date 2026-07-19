import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { makeLLM, extractJson } from "@/lib/ai";
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

  // 过滤掉完全空的行
  const rawRows: unknown[][] = (XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false, defval: "" }) as unknown[][])
    .filter((row) => row.some((cell) => String(cell ?? "").trim() !== ""));

  if (rawRows.length < 2) {
    return NextResponse.json({ error: "表格中未找到数据行" }, { status: 400 });
  }

  // ===== 完全依赖 AI 分析表格，不再硬编码规则 =====
  const previewRows = rawRows.slice(0, 15).map((row, idx) => ({
    index: idx,
    cells: (row as unknown[]).map((c) => String(c ?? "")),
  }));

  let headerRowIndex = 0;
  let headerMap: Record<string, number> = {};

  try {
    const prompt = `你是一位专业的表格分析专家。请分析下面的表格数据，找出表头行和关键列的位置。

表格数据（前 15 行）：
${previewRows.map((r) => `第${r.index}行: ${r.cells.join(" | ")}`).join("\n")}

请返回 JSON 格式（不要包含 markdown 代码块标记）：
{
  "header_row": 表头行的索引（0-14，即包含"姓名"、"身份证号"等列名的那一行）,
  "name_col": 姓名列的索引,
  "id_card_col": 身份证号列的索引,
  "phone_col": 电话列的索引（没有返回null）,
  "team_col": 班组列的索引（没有返回null）,
  "work_type_col": 工种列的索引（没有返回null）,
  "hire_date_col": 入职/进场日期列的索引（没有返回null）
}`;

    const llm = makeLLM();
    const response = await llm.invoke([{ role: "user", content: prompt }], { temperature: 0.1 });
    const text = response.content;
    const aiResult = extractJson<{
      header_row: number;
      name_col: number;
      id_card_col: number;
      phone_col?: number | null;
      team_col?: number | null;
      work_type_col?: number | null;
      hire_date_col?: number | null;
    }>(text);

    console.log("[workers/import] AI 分析结果:", aiResult);

    headerRowIndex = aiResult.header_row;
    headerMap = {
      name: aiResult.name_col,
      id_card: aiResult.id_card_col,
    };
    if (aiResult.phone_col !== null && aiResult.phone_col !== undefined) headerMap.phone = aiResult.phone_col;
    if (aiResult.team_col !== null && aiResult.team_col !== undefined) headerMap.team_name = aiResult.team_col;
    if (aiResult.work_type_col !== null && aiResult.work_type_col !== undefined) headerMap.work_type = aiResult.work_type_col;
    if (aiResult.hire_date_col !== null && aiResult.hire_date_col !== undefined) headerMap.hire_date = aiResult.hire_date_col;

    console.log("[workers/import] AI 识别表头:", { headerRowIndex, headerMap });
  } catch (e: unknown) {
    console.error("[workers/import] AI 分析失败:", (e as Error).message);
    return NextResponse.json(
      {
        error: "AI 分析表格失败，请检查表格格式是否正确",
        detail: (e as Error).message,
        detected_rows: previewRows
      },
      { status: 400 }
    );
  }

  if (headerMap.name === undefined || headerMap.id_card === undefined) {
    console.error("[workers/import] AI 未找到必需列", { headerMap });
    return NextResponse.json(
      { error: "表格必须包含『姓名』和『身份证号』两列", detected_rows: previewRows },
      { status: 400 },
    );
  }

  // 从表头行开始，提取数据行
  const rows = rawRows.slice(headerRowIndex);

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
