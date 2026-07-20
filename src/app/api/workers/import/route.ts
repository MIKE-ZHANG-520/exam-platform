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
export const maxDuration = 120; // AI 分析可能需要更长时间

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

  // 处理合并单元格：将合并区域的值填充到所有单元格
  const merges = sheet['!merges'] || [];
  for (const merge of merges) {
    const startCell = XLSX.utils.encode_cell({ r: merge.s.r, c: merge.s.c });
    const startValue = sheet[startCell]?.v;
    if (startValue !== undefined) {
      for (let r = merge.s.r; r <= merge.e.r; r++) {
        for (let c = merge.s.c; c <= merge.e.c; c++) {
          const cell = XLSX.utils.encode_cell({ r, c });
          if (!sheet[cell]) {
            sheet[cell] = { t: 's', v: String(startValue) };
          }
        }
      }
    }
  }

  // 读取所有行（包括空行，保持原始行号）
  const rawRows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: true, defval: "" }) as unknown[][];

  if (rawRows.length < 2) {
    return NextResponse.json({ error: "表格中未找到数据行" }, { status: 400 });
  }

  // ===== 让 AI 直接提取结构化数据 =====
  // 发送前 20 行给 AI，让 AI 直接提取工人信息
  const previewRows = rawRows.slice(0, 20).map((row, idx) => ({
    index: idx,
    cells: (row as unknown[]).map((c) => String(c ?? "")),
  }));

  let workersData: WorkerData[] = [];

  try {
    const prompt = `你是一位专业的数据提取专家。请从下面的表格数据中提取所有工人信息。

表格数据（前 20 行）：
${previewRows.map((r) => `第${r.index}行: ${r.cells.join(" | ")}`).join("\n")}

请提取所有工人的信息，返回 JSON 数组格式（不要包含 markdown 代码块标记）：
[
  {
    "name": "姓名",
    "id_card": "身份证号",
    "phone": "电话（没有则填空字符串）",
    "team_name": "班组名称（没有则填空字符串）",
    "work_type": "工种（没有则填空字符串）",
    "hire_date": "入职/进场日期（没有则填空字符串）"
  }
]

注意事项：
1. 表头行不要提取（只提取数据行）
2. 身份证号必须是 18 位数字（最后一位可能是 X）
3. 如果某列找不到，填空字符串
4. 必须返回合法的 JSON 数组`;

    const llm = makeLLM();
    const response = await llm.invoke([{ role: "user", content: prompt }], { temperature: 0.1 });
    const text = response.content;
    const aiResult = extractJson<WorkerData[]>(text);

    if (!Array.isArray(aiResult) || aiResult.length === 0) {
      return NextResponse.json({ error: "AI 未能提取到有效的工人数据" }, { status: 400 });
    }

    workersData = aiResult;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("AI 提取失败:", msg);
    return NextResponse.json({ error: `AI 提取失败：${msg}` }, { status: 400 });
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
    const rowNo = i + 2; // Excel 行号（从第 2 行开始）

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
  if (!dryRun && validPayloads.length > 0) {
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

  const summary = {
    total: workersData.length,
    success: dryRun ? results.filter((r) => r.status === "success").length : insertedCount,
    duplicate: results.filter((r) => r.status === "duplicate").length,
    invalid: results.filter((r) => r.status === "invalid").length,
    error: results.filter((r) => r.status === "error").length,
    db_duplicate: dbDuplicateCount,
    dry_run: dryRun,
  };

  return NextResponse.json({ summary, results });
}
