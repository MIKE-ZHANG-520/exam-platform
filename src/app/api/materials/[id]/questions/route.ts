import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { makeLLM, extractJson, DEFAULT_MODEL, SAFETY_EXPERT_ROLE } from "@/lib/ai";
import { requireSession } from "@/lib/auth";
import type { QuestionOption, QuestionType } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

interface Params {
  params: Promise<{ id: string }>;
}

type RiskLevel = "high" | "medium" | "low";

interface RawQuestion {
  type: QuestionType;
  content: string;
  options: QuestionOption[];
  answer: string[];
  explanation?: string;
  risk_level?: RiskLevel;
  tag?: string;
}

const EXPLANATION_SPEC = `**解析必须采用三段式结构**（用 "——" 分隔，不能省略任何一段）：
格式：「事故还原：xxx —— 原因分析：xxx —— 保命口诀：xxx」
- **事故还原**：用 1-2 句话还原题干场景中如果做错了会发生什么（有人物、有画面）
- **原因分析**：为什么正确答案是对的，错误选项错在哪，引用具体规范条款号（如"JGJ80-2016 第 4.2.3 条"）
- **保命口诀**：8-16 字朗朗上口的口诀，帮助工人记住这个知识点`;

/* ── 分批 Prompt：每次只生成 10 题，避免超长输出被截断 ── */

const EASY_BATCH_PROMPT = `${SAFETY_EXPERT_ROLE}

【任务】基于给定的建筑施工安全材料出**简易题库**，本次只出 10 道题。

一、题型要求
- 5 道单选题（type: "single"）：4 个选项 A/B/C/D，只有 1 个正确答案
- 5 道判断题（type: "judge"）：选项固定 [{"key":"A","text":"正确"},{"key":"B","text":"错误"}]，answer 为 ["A"] 或 ["B"]

二、风险等级
- 高风险题（risk_level: "high"）占比 ≥ 40%：安全红线、致死性风险（高处坠落、坍塌、触电等）
- 中风险（risk_level: "medium"）：常见违章、防护缺失
- 低风险（risk_level: "low"）：常识性、标识识别

三、题目生动化要求
1. **场景故事化**：所有题目基于真实工地场景改编，题干有人物、有情节、有具体环境。禁止"下列说法正确的是"。
2. **事故改编题**：至少 3 道改编自真实事故案例，题干先简述事故经过（有人名、时间、地点），再提问。
3. **看图辨隐患题**：判断题中至少 1 道是"场景描述+隐患识别"题型。
4. **错误选项迷惑性**：错误选项是工地上真实常见的错误做法，不是明显错误。

四、每题字段（严格按 JSON schema）
{
  "type": "single" | "judge",
  "content": "题干（场景题可 150 字内，紧扣工人实操场景）",
  "options": [{"key":"A","text":"..."},...],
  "answer": ["A"],
  "risk_level": "high" | "medium" | "low",
  "tag": "简短标签",
  "explanation": "三段式解析"
}

五、${EXPLANATION_SPEC}

六、输出严格 JSON 数组（10 个对象），禁止 Markdown 代码块外的任何说明文字。`;

const MEDIUM_BATCH_PROMPT = `${SAFETY_EXPERT_ROLE}

【任务】基于给定的建筑施工安全材料出**中等题库**，本次只出 10 道题。

一、题型要求
- 4 道单选题（type: "single"）：4 个选项 A/B/C/D，1 个正确答案
- 3 道多选题（type: "multiple"）：4 个选项 A/B/C/D，2-4 个正确答案。至少 1 道综合场景题
- 3 道判断题（type: "judge"）：选项固定 [{"key":"A","text":"正确"},{"key":"B","text":"错误"}]。至少 1 道场景描述题

二、题目生动化要求
1. **场景故事化**：所有题目基于真实工地场景改编，题干有人物、有情节、有具体环境。禁止"下列说法正确的是"。
2. **事故改编题**：至少 3 道改编自真实事故案例。
3. **看图辨隐患题**：判断题中至少 1 道是"场景描述+隐患识别"题型。
4. **错误选项迷惑性**：错误选项是工地上真实常见的错误做法。
5. **规范引用**：至少 1 道题引用具体规范条款号。

三、风险等级
- 高风险题（risk_level: "high"）占比 ≥ 40%
- 中风险约 35%，低风险约 25%

四、每题字段
{
  "type": "single" | "multiple" | "judge",
  "content": "题干（场景题可 200 字内）",
  "options": [{"key":"A","text":"..."},...],
  "answer": ["A","C"],
  "risk_level": "high" | "medium" | "low",
  "tag": "简短标签",
  "explanation": "三段式解析"
}

五、${EXPLANATION_SPEC}

六、输出严格 JSON 数组（10 个对象），禁止 Markdown 代码块外的任何说明文字。`;

const TOTAL_BATCHES = 4;

function sanitizeQuestions(raw: RawQuestion[]): RawQuestion[] {
  return raw
    .filter((q) => {
      if (!q || typeof q !== "object") return false;
      if (!["single", "multiple", "judge"].includes(q.type)) return false;
      if (!q.content || typeof q.content !== "string") return false;
      if (!Array.isArray(q.options) || q.options.length < 2) return false;
      if (!Array.isArray(q.answer) || q.answer.length === 0) return false;
      return true;
    })
    .map((q) => ({
      type: q.type,
      content: q.content.trim(),
      options: q.options.map((o) => ({ key: String(o.key).toUpperCase(), text: String(o.text) })),
      answer: q.answer.map((a) => String(a).toUpperCase()),
      explanation: q.explanation ? String(q.explanation) : "",
      risk_level: (q.risk_level as RiskLevel) || "medium",
      tag: q.tag ? String(q.tag) : null,
    })) as RawQuestion[];
}

/**
 * 调用 LLM 生成一批题目（10 题），带重试。
 */
async function generateBatch(
  llm: ReturnType<typeof makeLLM>,
  systemPrompt: string,
  userPrompt: string,
  batchLabel: string,
): Promise<RawQuestion[]> {
  let lastErr = "";

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const retryHint = attempt > 0
        ? "\n\n【重要】上次输出解析失败，请确保输出的是**纯 JSON 数组**，以 [ 开头、] 结尾，不要有任何多余文字。"
        : "";

      const response = await llm.invoke(
        [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt + retryHint },
        ],
        { model: DEFAULT_MODEL, temperature: 0.6 },
      );

      const raw = response.content?.trim() ?? "";
      if (!raw) {
        lastErr = "模型返回空内容";
        continue;
      }

      let parsed: unknown;
      try {
        parsed = extractJson<RawQuestion[]>(raw);
      } catch {
        lastErr = `JSON 解析失败（返回内容前 200 字: ${raw.slice(0, 200)}）`;
        continue;
      }

      if (!Array.isArray(parsed)) {
        lastErr = "模型返回的不是 JSON 数组";
        continue;
      }

      const cleaned = sanitizeQuestions(parsed);
      if (cleaned.length === 0) {
        lastErr = "清洗后无有效题目";
        continue;
      }

      console.log(`[questions] ${batchLabel} 第 ${attempt + 1} 次尝试成功，获取 ${cleaned.length} 题`);
      return cleaned;
    } catch (err) {
      lastErr = err instanceof Error ? err.message : String(err);
      console.error(`[questions] ${batchLabel} 第 ${attempt + 1} 次异常:`, lastErr);
    }
  }

  throw new Error(`${batchLabel} 生成失败: ${lastErr}`);
}

function riskLabel(level: RiskLevel): string {
  if (level === "high") return "🔴 重大风险";
  if (level === "medium") return "🟠 较大风险";
  return "🟡 一般风险";
}

/**
 * POST /api/materials/:id/questions
 * body: {
 *   difficulty: 'easy' | 'medium',
 *   batchIndex: 0 | 1 | 2 | 3,   // 前端循环调用，第 N 次
 *   bankId?: number,             // batchIndex > 0 时必传
 * }
 *
 * 单次请求只处理 1 批（10 题），耗时 ~30s，避免网关超时。
 * 前端循环调用 4 次即可拼齐 40 题。
 */
export async function POST(req: NextRequest, { params }: Params) {
  const sess = await requireSession();
  if (!sess) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const difficulty: "easy" | "medium" = body?.difficulty === "medium" ? "medium" : "easy";
    const batchIndex = typeof body?.batchIndex === "number" ? body.batchIndex : 0;
    const bankIdInput = typeof body?.bankId === "number" ? body.bankId : null;

    if (batchIndex < 0 || batchIndex >= TOTAL_BATCHES) {
      return NextResponse.json({ error: `batchIndex 必须在 0-${TOTAL_BATCHES - 1} 范围` }, { status: 400 });
    }

    const client = db();
    const { data: material, error: mErr } = await client
      .from("materials")
      .select("id, title, content_text")
      .eq("id", id)
      .maybeSingle();
    if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 });
    if (!material) return NextResponse.json({ error: "材料不存在" }, { status: 404 });
    if (!material.content_text) {
      return NextResponse.json({ error: "材料尚未解析，请先执行解析" }, { status: 400 });
    }

    // ── 第一次调用：先清理旧题库，创建新 bank（status='draft'，边生成边追加） ──
    let bankId: number;
    if (batchIndex === 0) {
      // 删除同 difficulty 的旧题库
      const { data: oldBanks } = await client
        .from("question_banks")
        .select("id")
        .eq("material_id", id)
        .eq("difficulty", difficulty);
      if (oldBanks && oldBanks.length > 0) {
        const ids = oldBanks.map((b) => b.id);
        if (ids.length > 0) await client.from("question_banks").delete().in("id", ids);
      }

      const bankTitle = `《${material.title}》培训题库（${difficulty === "easy" ? "简易" : "中等"}）`;
      const { data: newBank, error: bErr } = await client
        .from("question_banks")
        .insert({
          material_id: id,
          title: bankTitle,
          difficulty,
          total_count: 0,
          status: "draft",
          reviewed_by: sess.id,
        })
        .select("id")
        .single();
      if (bErr || !newBank) {
        return NextResponse.json({ error: bErr?.message || "创建题库失败" }, { status: 500 });
      }
      bankId = newBank.id;
    } else {
      if (!bankIdInput) {
        return NextResponse.json({ error: "batchIndex > 0 时必须传 bankId" }, { status: 400 });
      }
      bankId = bankIdInput;
    }

    // ── 生成本批 10 题 ──
    const llm = makeLLM(req.headers);
    const systemPrompt = difficulty === "easy" ? EASY_BATCH_PROMPT : MEDIUM_BATCH_PROMPT;
    const materialSlice = material.content_text.slice(0, 8000);
    const baseUserPrompt = `培训材料《${material.title}》：\n${materialSlice}\n\n请依据以上内容出题，严格按 JSON 数组格式输出。`;
    const batchLabel = `第 ${batchIndex + 1}/${TOTAL_BATCHES} 批`;
    const batchPrompt = `${baseUserPrompt}\n\n【本次要求】这是第 ${batchIndex + 1} 批（共 ${TOTAL_BATCHES} 批），请生成与其它批次**不重复**的 10 道题。请从材料的第 ${batchIndex + 1} 个不同角度或章节出题。`;

    let batchQuestions: RawQuestion[];
    try {
      batchQuestions = await generateBatch(llm, systemPrompt, batchPrompt, batchLabel);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // 本批失败，标记 bank 但不中断（前端可以继续下一批）
      return NextResponse.json(
        { bankId, batchIndex, totalBatches: TOTAL_BATCHES, generatedInBatch: 0, error: msg },
        { status: 200 },
      );
    }

    // ── 获取当前 bank 的已有最大 order_no，用于本批 order_no 起始 ──
    const { data: existing } = await client
      .from("questions")
      .select("order_no")
      .eq("bank_id", bankId)
      .order("order_no", { ascending: false })
      .limit(1);
    const startOrder = existing && existing.length > 0 ? Number(existing[0].order_no) || 0 : 0;

    const rows = batchQuestions.map((q, idx) => {
      const explanation = q.explanation
        ? q.risk_level && q.tag
          ? `【${riskLabel(q.risk_level)} · ${q.tag}】\n${q.explanation}`
          : q.explanation
        : null;
      return {
        bank_id: bankId,
        type: q.type,
        content: q.content,
        options: q.options,
        answer: q.answer,
        explanation,
        order_no: startOrder + idx + 1,
      };
    });

    const { error: qErr } = await client.from("questions").insert(rows);
    if (qErr) return NextResponse.json({ error: qErr.message }, { status: 500 });

    // ── 统计当前 bank 累计题数，更新 total_count ──
    const { count: totalCount } = await client
      .from("questions")
      .select("id", { count: "exact", head: true })
      .eq("bank_id", bankId);
    const total = typeof totalCount === "number" ? totalCount : startOrder + rows.length;

    // ── 最后一批：标记 bank 为 published，返回完整 bank 数据 ──
    const isLast = batchIndex === TOTAL_BATCHES - 1;
    if (isLast) {
      await client
        .from("question_banks")
        .update({ total_count: total, status: "published" })
        .eq("id", bankId);
    } else {
      await client
        .from("question_banks")
        .update({ total_count: total })
        .eq("id", bankId);
    }

    const { data: bank } = await client
      .from("question_banks")
      .select("id, title, difficulty, total_count, status, created_at")
      .eq("id", bankId)
      .single();

    return NextResponse.json({
      bank,
      bankId,
      batchIndex,
      totalBatches: TOTAL_BATCHES,
      generatedInBatch: rows.length,
      totalGenerated: total,
      done: isLast,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
