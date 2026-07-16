import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { makeFetch, makeLLM, extractJson, DEFAULT_MODEL, SAFETY_EXPERT_ROLE } from "@/lib/ai";
import { presignUrl } from "@/lib/storage";
import { requireSession } from "@/lib/auth";

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
    if (!text || text.length < 20) {
      const fileUrl = await presignUrl(material.file_key, 3600);
      const fetchClient = makeFetch(req.headers);
      const resp = await fetchClient.fetch(fileUrl);
      if (resp.status_code && resp.status_code !== 0) {
        throw new Error(resp.status_message || "文件解析失败");
      }
      text = (resp.content || [])
        .filter((item) => item.type === "text" && item.text)
        .map((item) => item.text as string)
        .join("\n")
        .trim();

      if (!text) throw new Error("文件解析后内容为空");
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
        status: "parsed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    return NextResponse.json({ material_id: id, text, metadata, cached: false });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await client
      .from("materials")
      .update({ status: "failed", error_message: msg })
      .eq("id", id);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
