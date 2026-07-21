import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { makeLLM, extractJson, DEFAULT_MODEL, SAFETY_EXPERT_ROLE } from "@/lib/ai";
import { presignUrl } from "@/lib/storage";
import { requireSession } from "@/lib/auth";
import * as XLSX from "xlsx";
import mammoth from "mammoth";

export const runtime = "nodejs";
export const maxDuration = 300;

interface Params {
  params: Promise<{ id: string }>;
}

interface MaterialMetadata {
  regulations: string[];      // 涉及的法规/规范名称
  clauses: string[];          // 涉及的具体条款编号
  risk_level: "high" | "medium" | "low";
  risk_categories: string[];  // 风险类别（如"高处坠落"/"触电"/"坍塌"）
  applicable_positions: string[]; // 适用岗位（如"钢筋工"/"塔吊司机"/"电工"）
  summary: string;            // 一句话摘要
}

const METADATA_PROMPT = `${SAFETY_EXPERT_ROLE}

【任务】从下面这份建筑施工安全培训材料中，抽取以下结构化元数据，帮助后续培训按岗位和风险等级精准推送。

严格输出 JSON（不要包 Markdown 代码块以外的其他文字）：
{
  "regulations": ["只填写【上传材料原文中已明确出现的】法规/规范。格式：编号+年份+《名称》全字段照抄，例如原文写了 'JGJ 80-2016' 就照写。原文没提到具体编号或年份的，写中文类别名（如'高处作业安全规范'），禁止自行补充编号年份。材料没提任何法规就填 []"],
  "clauses": ["只填写【上传材料原文中已明确出现的】具体条款编号（如 '第4.1.5条'）。材料没提就填 []。禁止自行编造条款号"],
  "risk_level": "high" | "medium" | "low",
  "risk_categories": ["涉及的风险类型，从这些里选：高处坠落、坍塌、触电、机械伤害、起重伤害、火灾爆炸、物体打击、中毒窒息、其他"],
  "applicable_positions": ["适用岗位，如 '钢筋工'、'塔吊司机'、'电工'、'架子工'、'焊工'、'班组长'、'一线工人（通用）'"],
  "summary": "一句话总结这份材料的核心内容（30-50 字）"
}

若某项无法从材料中识别，用空数组或 "medium" 作默认值。**regulations 与 clauses 只能包含材料原文里明确出现的内容，禁止基于常识补充或编造**。宁可留空也不许猜编号年份。`;

// POST /api/materials/:id/parse 解析材料文件为文本并抽取元数据
export async function POST(req: NextRequest, { params }: Params) {
  const sess = await requireSession();
  if (!sess) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id } = await params;
  const client = db();

  const { data: material, error: mErr } = await client
    .from("materials")
    .select("id, title, file_key, file_type, content_text, metadata, status")
    .eq("id", id)
    .maybeSingle();
  if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 });
  if (!material) return NextResponse.json({ error: "材料不存在" }, { status: 404 });

  // 已有内容且已有元数据则直接返回
  if (material.content_text && material.content_text.length > 20 && material.metadata) {
    return NextResponse.json({
      material_id: id,
      text: material.content_text,
      metadata: material.metadata,
      cached: true,
    });
  }

  await client
    .from("materials")
    .update({ status: "parsing", error_message: null })
    .eq("id", id);

  try {
    let text = material.content_text || "";
    const fileType = material.file_type?.toLowerCase();
    if (!text || text.length < 20) {
      const fileUrl = await presignUrl(material.file_key, 3600);
      
      // 先检查文件是否存在
      const headResp = await fetch(fileUrl, { method: "HEAD" });
      if (headResp.status === 404) {
        throw new Error("文件在存储中不存在，可能上传失败。请删除此材料后重新上传");
      }
      if (!headResp.ok) {
        throw new Error(`无法访问文件：存储返回 ${headResp.status}`);
      }
      
      // 直接获取文件内容
      const fileResp = await fetch(fileUrl);
      if (!fileResp.ok) {
        throw new Error(`获取文件失败：HTTP ${fileResp.status}`);
      }
      
      // 根据文件类型解析内容
      if (fileType === "pdf") {
        // PDF文件使用pdf2json解析
        const arrayBuffer = await fileResp.arrayBuffer();
        try {
          const PDFParser = require("pdf2json");
          const pdfParser = new PDFParser();
          
          await new Promise<void>((resolve, reject) => {
            pdfParser.on("pdfParser_dataError", reject);
            pdfParser.on("pdfParser_dataReady", resolve);
            pdfParser.parseBuffer(Buffer.from(arrayBuffer));
          });
          
          // 提取文本内容
          const pdfData = pdfParser.data as {
            Pages?: Array<{
              Texts?: Array<{
                R?: Array<{ T?: string }>;
              }>;
            }>;
          };
          
          // 记录页数（供后续统计使用）
          const pageCount = pdfData?.Pages?.length || 0;
          (globalThis as Record<string, unknown>).__pdfPageCount = pageCount;
          
          const textParts: string[] = [];
          if (pdfData?.Pages) {
            for (const page of pdfData.Pages) {
              if (page.Texts) {
                for (const textItem of page.Texts) {
                  if (textItem.R) {
                    for (const run of textItem.R) {
                      if (run.T) {
                        // pdf2json 用 encodeURIComponent 编码文本，但某些 PDF（含中文/特殊字体）
                        // 会产生非法 URI 序列，导致 decodeURIComponent 抛出 "URI malformed"
                        // 降级策略：decodeURIComponent → unescape → 原始文本
                        let decoded: string;
                        try {
                          decoded = decodeURIComponent(run.T);
                        } catch {
                          try {
                            decoded = unescape(run.T);
                          } catch {
                            decoded = run.T;
                          }
                        }
                        textParts.push(decoded);
                      }
                    }
                  }
                }
              }
              textParts.push("\n");
            }
          }
          text = textParts.join(" ").trim();
        } catch (pdfErr) {
          let errMsg: string;
          if (pdfErr && typeof pdfErr === "object" && "parserError" in pdfErr) {
            errMsg = String((pdfErr as { parserError: unknown }).parserError);
          } else if (pdfErr instanceof Error) {
            errMsg = pdfErr.message;
          } else {
            errMsg = String(pdfErr);
          }
          throw new Error(`PDF解析失败：${errMsg}`);
        }
      } else if (fileType === "md" || fileType === "txt") {
        // 文本文件直接读取
        text = await fileResp.text();
      } else if (fileType === "xlsx" || fileType === "docx") {
        // XLSX/DOCX文件需要读取为buffer
        const fileBuffer = Buffer.from(await fileResp.arrayBuffer());
        if (fileType === "xlsx") {
          // XLSX文件使用xlsx库解析
          const workbook = XLSX.read(fileBuffer, { type: "buffer" });
          const texts: string[] = [];
          for (const sheetName of workbook.SheetNames) {
            const sheet = workbook.Sheets[sheetName];
            if (!sheet) continue;
            const csv = XLSX.utils.sheet_to_csv(sheet);
            texts.push(`[${sheetName}]\n${csv}`);
          }
          text = texts.join("\n\n");
        } else {
          // DOCX文件使用mammoth库解析
          const result = await mammoth.extractRawText({ buffer: fileBuffer });
          text = result.value;
        }
      } else {
        throw new Error(`不支持的文件类型：${fileType}`);
      }

      text = text.trim();
      if (!text) throw new Error("文件解析后内容为空");
    }

    // 解析统计：计算页数、字数、警告
    const parseStats = {
      char_count: text.length,
      page_count: 0,
      avg_chars_per_page: 0,
      warnings: [] as string[],
    };

    // PDF 页数统计（从 pdfData 获取）
    if (fileType === "pdf" && typeof (globalThis as Record<string, unknown>).__pdfPageCount === "number") {
      parseStats.page_count = (globalThis as Record<string, unknown>).__pdfPageCount as number;
      delete (globalThis as Record<string, unknown>).__pdfPageCount;
    }

    if (parseStats.page_count > 0) {
      parseStats.avg_chars_per_page = Math.round(text.length / parseStats.page_count);
      if (parseStats.avg_chars_per_page < 50) {
        parseStats.warnings.push(`每页平均仅 ${parseStats.avg_chars_per_page} 字，可能是扫描件或图片PDF，文字提取不完整`);
      }
    }
    if (text.length < 200) {
      parseStats.warnings.push(`解析后仅 ${text.length} 字，内容可能不完整`);
    }

    // AI 抽取元数据
    let metadata: MaterialMetadata | null = null;
    try {
      const llm = makeLLM(req.headers);
      const resp = await llm.invoke(
        [
          { role: "system", content: METADATA_PROMPT },
          {
            role: "user",
            content: `材料名称：《${material.title}》\n\n材料内容（截断）：\n${text.slice(0, 8000)}`,
          },
        ],
        { model: DEFAULT_MODEL, temperature: 0.2 },
      );
      metadata = extractJson<MaterialMetadata>(resp.content);
      // 兜底
      if (!metadata.risk_level || !["high", "medium", "low"].includes(metadata.risk_level)) {
        metadata.risk_level = "medium";
      }
      metadata.regulations = Array.isArray(metadata.regulations) ? metadata.regulations : [];
      metadata.clauses = Array.isArray(metadata.clauses) ? metadata.clauses : [];
      metadata.risk_categories = Array.isArray(metadata.risk_categories) ? metadata.risk_categories : [];
      metadata.applicable_positions = Array.isArray(metadata.applicable_positions) ? metadata.applicable_positions : [];
      metadata.summary = metadata.summary || "";
    } catch (e) {
      // 元数据抽取失败不影响文本解析主流程
      const em = e instanceof Error ? e.message : String(e);
      console.warn("[parse] metadata extraction failed:", em);
    }

    await client
      .from("materials")
      .update({
        content_text: text,
        metadata: metadata,
        parse_stats: parseStats,
        status: "parsed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    return NextResponse.json({ material_id: id, text, metadata, parse_stats: parseStats, cached: false });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await client
      .from("materials")
      .update({ status: "failed", error_message: msg })
      .eq("id", id);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
