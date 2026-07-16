import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  startChat,
  pollChat,
  fetchAnswer,
  extractJson,
  SAFETY_EXPERT_ROLE,
  type ChatHandle,
} from "@/lib/ai";
import { requireSession } from "@/lib/auth";
import type { QuestionOption, QuestionType } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

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
- **原因分析**：为什么正确答案是对的，错误选项错在哪
- **保命口诀**：8-16 字朗朗上口的口诀`;

const EASY_BATCH_PROMPT = `${SAFETY_EXPERT_ROLE}

【任务】基于给定的建筑施工安全材料出**简易题库**，本次只出 5 道题。

一、题型要求
- 3 道单选题（type: "single"）：4 个选项 A/B/C/D，只有 1 个正确答案
- 2 道判断题（type: "judge"）：选项固定 [{"key":"A","text":"正确"},{"key":"B","text":"错误"}]

二、风险等级
- 高风险题（risk_level: "high"）占比 ≥ 40%
- 中风险（risk_level: "medium"）常见违章
- 低风险（risk_level: "low"）常识性

三、题目生动化
1. 场景故事化：题干有人物、有情节，禁止"下列说法正确的是"。
2. 错误选项贴近工地真实错误做法。

四、每题字段
{
  "type": "single" | "judge",
  "content": "题干（≤ 120 字）",
  "options": [{"key":"A","text":"..."},...],
  "answer": ["A"],
  "risk_level": "high" | "medium" | "low",
  "tag": "考点标签（如 高处坠落、临时用电、动火作业等）",
  "explanation": "三段式解析"
}

五、${EXPLANATION_SPEC}

六、输出严格 JSON 数组（5 个对象），禁止任何多余说明文字。`;

const MEDIUM_BATCH_PROMPT = `${SAFETY_EXPERT_ROLE}

【任务】基于给定的建筑施工安全材料出**中等题库**，本次只出 5 道题。

一、题型要求
- 2 道单选题（type: "single"）
- 2 道多选题（type: "multiple"）：2-4 个正确答案
- 1 道判断题（type: "judge"）：选项固定 [{"key":"A","text":"正确"},{"key":"B","text":"错误"}]

二、题目生动化
1. 场景故事化，有人物有情节。
2. 至少 2 道改编自真实事故案例。
3. 错误选项贴近工地真实错误做法。

三、风险等级
- 高风险题（risk_level: "high"）占比 ≥ 40%

四、每题字段
{
  "type": "single" | "multiple" | "judge",
  "content": "题干（≤ 150 字）",
  "options": [{"key":"A","text":"..."},...],
  "answer": ["A","C"],
  "risk_level": "high" | "medium" | "low",
  "tag": "考点标签（如 高处坠落、临时用电、动火作业等）",
  "explanation": "三段式解析"
}

六、${EXPLANATION_SPEC}

七、输出严格 JSON 数组（5 个对象），禁止任何多余说明文字。`;

const TOTAL_BATCHES = 8;

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

function riskLabel(level: RiskLevel): string {
  if (level === "high") return "🔴 重大风险";
  if (level === "medium") return "🟠 较大风险";
  return "🟡 一般风险";
}

/**
 * POST /api/materials/:id/questions
 *
 * 三阶段异步接口：每次调用 <5s 返回，彻底避免网关超时。
 *
 * body 三种模式：
 *
 * 1) { action: "start", difficulty, batchIndex, bankId? }
 *    → 创建 Bot 对话（不等待完成）
 *    → 返回 { chatId, conversationId, bankId }
 *    → 第 1 批（batchIndex=0）时会先删除旧题库、创建新 bank
 *
 * 2) { action: "poll", chatId, conversationId }
 *    → 查询 Bot 状态，返回 { status, ready }
 *
 * 3) { action: "finalize", chatId, conversationId, bankId, batchIndex, difficulty }
 *    → 拉取 Bot 回复、解析题目、写入 DB
 *    → 返回 { generated, totalGenerated, done }
 *    → 最后一批（batchIndex=TOTAL-1）会将 bank 状态标记为 published
 */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const action: "warmup" | "start" | "poll" | "finalize" = body?.action;

    // warmup 走在鉴权前面，最轻量，纯用于唤醒 FaaS 冷启动实例
    if (action === "warmup") return NextResponse.json({ ok: true, ts: Date.now() });

    const sess = await requireSession();
    if (!sess) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

    if (action === "start") return await handleStart(id, body, sess.id);
    if (action === "poll") return await handlePoll(body);
    if (action === "finalize") return await handleFinalize(body);

    return NextResponse.json({ error: "action 必须是 warmup / start / poll / finalize" }, { status: 400 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[questions] POST fatal:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

async function handleStart(
  materialId: string,
  body: {
    difficulty?: "easy" | "medium";
    batchIndex?: number;
    bankId?: string;
    note?: string;
  },
  userId: string,
): Promise<NextResponse> {
  const difficulty: "easy" | "medium" = body.difficulty === "medium" ? "medium" : "easy";
  const batchIndex = typeof body.batchIndex === "number" ? body.batchIndex : 0;
  const rawNote = typeof body.note === "string" ? body.note.trim() : "";
  const note = rawNote.slice(0, 800);

  if (batchIndex < 0 || batchIndex >= TOTAL_BATCHES) {
    return NextResponse.json({ error: `batchIndex 必须在 0-${TOTAL_BATCHES - 1}` }, { status: 400 });
  }

  const client = db();
  const { data: material, error: mErr } = await client
    .from("materials")
    .select("id, title, content_text")
    .eq("id", materialId)
    .maybeSingle();
  if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 });
  if (!material) return NextResponse.json({ error: "材料不存在" }, { status: 404 });
  if (!material.content_text) {
    return NextResponse.json({ error: "材料尚未解析，请先执行解析" }, { status: 400 });
  }

  // 第 1 批：删除同 difficulty 旧题库 + 创建新 bank
  let bankId: string;
  if (batchIndex === 0) {
    const { data: oldBanks } = await client
      .from("question_banks")
      .select("id")
      .eq("material_id", materialId)
      .eq("difficulty", difficulty);
    if (oldBanks && oldBanks.length > 0) {
      const ids = oldBanks.map((b) => b.id);
      if (ids.length > 0) await client.from("question_banks").delete().in("id", ids);
    }

    const bankTitle = `《${material.title}》培训题库（${difficulty === "easy" ? "简易" : "中等"}）`;
    const { data: newBank, error: bErr } = await client
      .from("question_banks")
      .insert({
        material_id: materialId,
        title: bankTitle,
        difficulty,
        total_count: 0,
        status: "draft",
        owner_id: userId,
        generation_note: note || null,
      })
      .select("id")
      .single();
    if (bErr || !newBank) {
      return NextResponse.json({ error: bErr?.message || "创建题库失败" }, { status: 500 });
    }
    bankId = newBank.id;
  } else {
    if (!body.bankId) {
      return NextResponse.json({ error: "batchIndex > 0 时必须传 bankId" }, { status: 400 });
    }
    bankId = body.bankId;
  }

  // 构造 prompt
  const systemPrompt = difficulty === "easy" ? EASY_BATCH_PROMPT : MEDIUM_BATCH_PROMPT;
  const materialSlice = material.content_text.slice(0, 6000);
  const noteBlock = note
    ? `\n\n【教研特别要求 · 优先级最高】\n${note}\n（以上要求由管理员针对本次生成设定，必须严格执行；与通用规则冲突时以此为准。）`
    : "";
  const userPrompt = `培训材料《${material.title}》：\n${materialSlice}${noteBlock}\n\n【本次批次】这是第 ${batchIndex + 1} 批（共 ${TOTAL_BATCHES} 批），请生成 5 道与其他批次不重复的题目。请从材料的第 ${batchIndex + 1} 个不同角度或章节切入。严格按 JSON 数组格式输出。`;

  // 只创建 Bot 对话，立即返回（<3s）
  console.log(`[questions] start batch ${batchIndex + 1}/${TOTAL_BATCHES}`);
  const handle = await startChat([
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ]);

  return NextResponse.json({
    chatId: handle.chatId,
    conversationId: handle.conversationId,
    bankId,
    batchIndex,
    totalBatches: TOTAL_BATCHES,
  });
}

async function handlePoll(body: {
  chatId?: string;
  conversationId?: string;
}): Promise<NextResponse> {
  if (!body.chatId || !body.conversationId) {
    return NextResponse.json({ error: "chatId / conversationId 缺失" }, { status: 400 });
  }
  const handle: ChatHandle = { chatId: body.chatId, conversationId: body.conversationId };
  const { status, ready } = await pollChat(handle);
  return NextResponse.json({ status, ready });
}

async function handleFinalize(body: {
  chatId?: string;
  conversationId?: string;
  bankId?: string;
  batchIndex?: number;
  difficulty?: "easy" | "medium";
}): Promise<NextResponse> {
  if (!body.chatId || !body.conversationId || !body.bankId) {
    return NextResponse.json({ error: "chatId / conversationId / bankId 缺失" }, { status: 400 });
  }
  const handle: ChatHandle = { chatId: body.chatId, conversationId: body.conversationId };
  const bankId = body.bankId;
  const batchIndex = typeof body.batchIndex === "number" ? body.batchIndex : 0;
  const isLast = batchIndex === TOTAL_BATCHES - 1;

  const client = db();

  // 拉取 Bot 回复
  let raw = "";
  try {
    raw = await fetchAnswer(handle);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[questions] finalize batch ${batchIndex + 1} fetchAnswer failed:`, msg);
    return NextResponse.json({ generated: 0, error: `批次失败: ${msg}`, totalGenerated: await countBank(bankId) }, { status: 200 });
  }

  // 解析题目
  let cleaned: RawQuestion[] = [];
  try {
    const parsed = extractJson<RawQuestion[]>(raw);
    if (Array.isArray(parsed)) {
      cleaned = sanitizeQuestions(parsed);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[questions] finalize batch ${batchIndex + 1} parse failed:`, msg);
  }

  if (cleaned.length === 0) {
    return NextResponse.json({
      generated: 0,
      totalGenerated: await countBank(bankId),
      done: isLast,
      error: `本批 JSON 解析失败，前 200 字: ${raw.slice(0, 200)}`,
    }, { status: 200 });
  }

  // 获取当前最大 order_no
  const { data: existing } = await client
    .from("questions")
    .select("order_no")
    .eq("bank_id", bankId)
    .order("order_no", { ascending: false })
    .limit(1);
  const startOrder = existing && existing.length > 0 ? Number(existing[0].order_no) || 0 : 0;

  const rows = cleaned.map((q, idx) => {
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

  const total = await countBank(bankId);

  await client
    .from("question_banks")
    .update({
      total_count: total,
      status: isLast ? "published" : "draft",
    })
    .eq("id", bankId);

  console.log(`[questions] finalize batch ${batchIndex + 1}/${TOTAL_BATCHES} +${rows.length} 题, 累计 ${total} 题`);

  return NextResponse.json({
    generated: rows.length,
    totalGenerated: total,
    done: isLast,
    bankId,
  });
}

async function countBank(bankId: string): Promise<number> {
  const client = db();
  const { count } = await client
    .from("questions")
    .select("id", { count: "exact", head: true })
    .eq("bank_id", bankId);
  return typeof count === "number" ? count : 0;
}
