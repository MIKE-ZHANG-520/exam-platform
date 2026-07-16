import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  startChat,
  pollChat,
  fetchAnswer,
  SAFETY_EXPERT_ROLE,
  type ChatHandle,
} from "@/lib/ai";
import { requireSession } from "@/lib/auth";

export const runtime = "nodejs";
export const maxDuration = 60;

interface Params {
  params: Promise<{ id: string }>;
}

const WORKER_PROMPT = `${SAFETY_EXPERT_ROLE}

【任务】面向一线工人，基于原始材料输出**建筑施工安全**培训提纲。你要像一位干了 20 年的老师傅跟新工人唠嗑一样讲安全——有故事、有画面、有口诀，让工人听得进去、记得住、用得上。

一、结构（严格执行，每章必须包含全部 7 个模块）

每个章节用 "## 章节标题" 开头。标题必须是口语化短句，像老师傅喊话，例如：
"## 上岗前先看这三样"、"## 高处作业系稳你的保命绳"、"## 临时用电别瞎接，三级配电保平安"

每个章节**必须按以下顺序输出 7 个模块**：

**模块 1 - 故事开场**（必须）：
格式："📖 故事：xxx"
用一个真实工地小故事或事故案例开场（50-100 字），有人物、有场景、有结果。

**模块 2 - 风险等级**（必须）：
格式："> 🔴 重大风险 · 可能致命" 或 "> 🟠 较大风险 · 可能重伤" 或 "> 🟡 一般风险 · 可能轻伤"

**模块 3 - 要点条目**（必须，3-6 条）：
每条独占一行，按类型标注：
- "✅ 正确做法：xxx"（要点+条款号）
- "⚠️ 注意事项：xxx"
- "🔴 禁止行为：xxx"
- "① ② ③"（分步骤操作时使用）
- "**重点**：xxx"

**模块 4 - 口诀记忆**（必须）：
格式："> 💡 口诀：xxxxx（8-16 字，朗朗上口）"

**模块 5 - 配图建议**（必须）：
格式："🎨 配图建议：xxx"

**模块 6 - 事故警示**（必须）：
格式："🚨 典型案例：××年××工程发生××事故（原因：××；后果：××人伤亡）"

**模块 7 - 考考你**（必须）：
格式："❓ 考考你：xxx？"

二、内容深度
- 全篇不少于 5 个章节
- 每条要点必须落到"做什么 / 怎么做 / 为什么"三要素之一
- 涉及数值必须给出具体数字（如"坠落高度 ≥ 2m 必须使用安全带"）
- 覆盖建筑施工八大类专项安全要点中至少 3 类
- 语言风格：工人听得懂的大白话，禁止堆砌专业术语

三、输出格式
- 全部 Markdown，不出现表格、代码块
- 内容紧扣给定材料，禁止编造与材料主题无关的规范`;

const TRAINER_PROMPT = `${SAFETY_EXPERT_ROLE}

【任务】面向培训讲师，基于原始材料输出**建筑施工安全**授课备课手册。这份手册要让讲师拿到就能直接上课——有破冰、有互动、有演练、有时间表。

一、开头必备（3 行）
- "**总时长建议：xx 分钟**"（一般 45-90 分钟）
- "**受众建议**：xxx"
- "**核心目标**：xxx；xxx；xxx（不超过 3 条）"

二、结构（至少 4 章，每章 7 模块）

**模块 1 - 破冰互动**（必须）：格式 "🧊 破冰（x 分钟）：xxx"
**模块 2 - 风险等级**（必须）：格式 "> 🔴/🟠/🟡 xx 风险 · ..."
**模块 3 - 核心知识点**（必须，2-4 条）：格式 "🎯 核心知识点：xxx"，引用具体规范。
**模块 4 - 常见误区**（必须，2-3 条）：格式 "⚠️ 常见误区：xxx"
**模块 5 - 事故案例与角色扮演**（必须）：格式 "🚨 事故案例：xxx" + "🎭 角色扮演：xxx"
**模块 6 - 分组讨论**（必须）：格式 "💬 分组讨论（x 分钟）：xxx？" + "📌 引导方向：xxx"
**模块 7 - 互动话术与时间分配**（必须）：格式 "🗣️ 互动话术：..." + "⏱️ 时间分配：讲解 xx + 互动 xx + 练习 xx + 休息 xx"

三、输出格式
- Markdown，不出现表格、代码块
- 内容严格贴合给定材料，禁止空谈`;

/**
 * POST /api/materials/:id/outline
 *
 * 三阶段异步接口：
 *
 * 1) { action: "start", audience }
 *    → 创建 Bot 对话，返回 { chatId, conversationId }
 *
 * 2) { action: "poll", chatId, conversationId }
 *    → 查询状态，返回 { status, ready }
 *
 * 3) { action: "finalize", chatId, conversationId, audience }
 *    → 拉取回复、覆盖旧提纲、返回 { outline }
 */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const action: "warmup" | "start" | "poll" | "finalize" = body?.action;

    if (action === "warmup") return NextResponse.json({ ok: true, ts: Date.now() });

    const sess = await requireSession();
    if (!sess) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

    if (action === "start") return await handleStart(id, body);
    if (action === "poll") return await handlePoll(body);
    if (action === "finalize") return await handleFinalize(id, body);

    return NextResponse.json({ error: "action 必须是 warmup / start / poll / finalize" }, { status: 400 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[outline] POST fatal:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

async function handleStart(
  materialId: string,
  body: { audience?: "worker" | "trainer" },
): Promise<NextResponse> {
  const audience: "worker" | "trainer" = body.audience === "trainer" ? "trainer" : "worker";

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

  const systemPrompt = audience === "worker" ? WORKER_PROMPT : TRAINER_PROMPT;
  const userPrompt = `培训材料标题：《${material.title}》\n\n以下是原始材料内容（可能截断）：\n${material.content_text.slice(0, 12000)}\n\n请依据以上内容输出 Markdown 提纲。`;

  console.log(`[outline] start ${audience} for ${materialId}`);
  const handle = await startChat([
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ]);
  console.log(`[outline] start ${audience} chat_id=${handle.chatId}`);

  return NextResponse.json({
    chatId: handle.chatId,
    conversationId: handle.conversationId,
  });
}

async function handlePoll(body: {
  chatId?: string;
  conversationId?: string;
}): Promise<NextResponse> {
  if (!body.chatId || !body.conversationId) {
    return NextResponse.json({ error: "poll 需要 chatId + conversationId" }, { status: 400 });
  }
  const handle: ChatHandle = {
    chatId: body.chatId,
    conversationId: body.conversationId,
  };
  const { status, ready } = await pollChat(handle);
  return NextResponse.json({ status, ready });
}

async function handleFinalize(
  materialId: string,
  body: {
    chatId?: string;
    conversationId?: string;
    audience?: "worker" | "trainer";
  },
): Promise<NextResponse> {
  if (!body.chatId || !body.conversationId) {
    return NextResponse.json({ error: "finalize 需要 chatId + conversationId" }, { status: 400 });
  }
  const audience: "worker" | "trainer" = body.audience === "trainer" ? "trainer" : "worker";
  const handle: ChatHandle = {
    chatId: body.chatId,
    conversationId: body.conversationId,
  };

  let content_md = "";
  try {
    content_md = (await fetchAnswer(handle)).trim();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[outline] finalize ${audience} fetchAnswer failed:`, msg);
    return NextResponse.json({ error: `拉取生成结果失败: ${msg}` }, { status: 500 });
  }

  if (!content_md) {
    return NextResponse.json({ error: "生成结果为空" }, { status: 500 });
  }

  const client = db();
  const { data: material, error: mErr } = await client
    .from("materials")
    .select("id, title")
    .eq("id", materialId)
    .maybeSingle();
  if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 });
  if (!material) return NextResponse.json({ error: "材料不存在" }, { status: 404 });

  await client.from("outlines").delete().eq("material_id", materialId).eq("audience", audience);

  const outlineTitle = `《${material.title}》培训提纲（${audience === "worker" ? "工人版" : "培训师版"}）`;

  const { data: inserted, error: iErr } = await client
    .from("outlines")
    .insert({
      material_id: materialId,
      audience,
      content_md,
      title: outlineTitle,
      status: "published",
    })
    .select("id, audience, title, content_md, status, created_at")
    .single();
  if (iErr) return NextResponse.json({ error: iErr.message }, { status: 500 });

  console.log(`[outline] finalize ${audience} done, length=${content_md.length}`);
  return NextResponse.json({ outline: inserted });
}
