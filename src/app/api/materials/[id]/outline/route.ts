import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { makeLLM, DEFAULT_MODEL, SAFETY_EXPERT_ROLE } from "@/lib/ai";
import { requireSession } from "@/lib/auth";

export const runtime = "nodejs";
export const maxDuration = 300;

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
例如："📖 故事：老李昨天在 3 号楼脚手架上踩空了一块跳板，整个人悬在半空。幸亏他系了安全带，高挂低用，被工友拉了上来。要是没系，6 米高掉下来，后果不堪设想……"

**模块 2 - 风险等级**（必须）：
格式："> 🔴 重大风险 · 可能致命" 或 "> 🟠 较大风险 · 可能重伤" 或 "> 🟡 一般风险 · 可能轻伤"
选一个最贴合的等级，用工人能理解的话解释后果。

**模块 3 - 要点条目**（必须，3-6 条）：
每条独占一行，按类型标注：
- "✅ 正确做法：xxx"（要点+对应规范条款号，如"依据 JGJ80-2016 第 4.1.5 条"）
- "⚠️ 注意事项：xxx"（作业细节 / 常见忽视点）
- "🔴 禁止行为：xxx"（安全红线 / 三违行为）
- "① ② ③"（分步骤操作时使用）
- "**重点**：xxx"（关键短语用 **加粗** 包裹）
所有要点必须结合具体工种和作业场景，不说空话。

**模块 4 - 口诀记忆**（必须）：
格式："> 💡 口诀：xxxxx（8-16 字，朗朗上口，能脱口而出）"
例如："安全带，高挂低用，保命的绳，别嫌麻烦"

**模块 5 - 配图建议**（必须）：
格式："🎨 配图建议：xxx（用文字描述一幅画面，方便后续做成海报或手册插图）"
例如："🎨 配图建议：一个工人挂在安全带上，脚下是空的，旁边标注'高挂低用'四个大字，背景是蓝天白云的工地"

**模块 6 - 事故警示**（必须）：
格式："🚨 典型案例：××年××工程发生××事故（原因：××；后果：××人伤亡）"
若原始材料未提供具体案例，用行业公开的通用事故类型描述。

**模块 7 - 考考你**（必须）：
格式："❓ 考考你：xxx？"
每章末尾留一个互动小问题，引发思考，答案在下一章或括号里给出。
例如："❓ 考考你：安全带应该挂在作业位置上方还是下方？（答案：上方，高挂低用）"

二、内容深度
- 全篇不少于 5 个章节
- 每条要点必须落到"做什么 / 怎么做 / 为什么"三要素之一
- 涉及数值必须给出具体数字（如"坠落高度 ≥ 2m 必须使用安全带"）
- 涉及设备/工具的必须写出型号或参数要求
- 覆盖建筑施工八大类专项安全要点中至少 3 类
- **语言风格**：用工人听得懂的大白话，像老师傅唠嗑，禁止堆砌专业术语

三、输出格式
- 全部使用 Markdown 语法
- 不出现表格、代码块
- 内容必须紧扣给定材料，禁止编造与材料主题无关的规范`;

const TRAINER_PROMPT = `${SAFETY_EXPERT_ROLE}

【任务】面向培训讲师，基于原始材料输出**建筑施工安全**授课备课手册。这份手册要让讲师拿到就能直接上课——有破冰、有互动、有演练、有时间表，不是念 PPT。

一、开头必备（3 行）
- "**总时长建议：xx 分钟**"（一般 45-90 分钟）
- "**受众建议**：xxx（岗位、工种、班组类型）"
- "**核心目标**：xxx；xxx；xxx（不超过 3 条）"

二、结构（严格执行，每章必须包含全部 7 个模块）

划分至少 4 个 "## 章节标题" 章节。每章**必须按以下顺序输出 7 个模块**：

**模块 1 - 破冰互动**（必须）：
格式："🧊 破冰（x 分钟）：xxx"
设计一个 1-2 分钟的破冰小互动，如举手问答、现场小调查、情景快问快答。
例如："🧊 破冰（2 分钟）：举手投票——'在座各位，上周有没有看到工地上有人没戴安全帽？'看到的不举手，没看到的举手。用反差感开场。"

**模块 2 - 风险等级**（必须）：
格式："> 🔴 重大风险 · ..." / "> 🟠 较大风险 · ..." / "> 🟡 一般风险 · ..."

**模块 3 - 核心知识点**（必须，2-4 条）：
格式："🎯 核心知识点：xxx（配规范条款号）"
每条必须引用具体规范（JGJ80、JGJ46、JGJ130、JGJ59、JGJ162 等）。

**模块 4 - 常见误区预警**（必须，2-3 条）：
格式："⚠️ 常见误区：xxx（施工现场常见错误做法及后果）"
明确标注工人最容易犯的错误和讲师需要重点强调的内容。

**模块 5 - 事故案例与角色扮演**（必须）：
格式："🚨 事故案例：xxx（简述事故经过：单位/年份/伤亡/原因）"
格式："🎭 角色扮演：xxx（角色分配：A 扮演班组长、B 扮演新工人、C 扮演安全员；演练场景：xxx；时长 x 分钟）"
设计 2-3 个典型事故案例的角色扮演方案。

**模块 6 - 分组讨论**（必须）：
格式："💬 分组讨论（x 分钟）：xxx？"
格式："📌 引导方向：xxx（讲师如何引导讨论、预期答案方向）"
每章设计 1 个分组讨论题目和引导方向。

**模块 7 - 互动话术与时间分配**（必须）：
格式："🗣️ 互动话术："
每条给 2-3 句讲师可以直接用的互动提问话术。
格式："⏱️ 时间分配：讲解 xx 分钟 + 互动 xx 分钟 + 练习 xx 分钟 + 休息 xx 分钟"

三、内容深度
- 引用具体规范条款号
- 每章"事故案例"必须与本章主题匹配
- 演练环节必须具体、可执行，包含角色分配和时长
- 时间分配精确到分钟

四、输出格式
- Markdown，不出现表格、代码块
- 内容严格贴合给定材料，禁止空谈`;

// POST /api/materials/:id/outline
// body: { audience: 'worker' | 'trainer' }
export async function POST(req: NextRequest, { params }: Params) {
  const sess = await requireSession();
  if (!sess) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const audience: "worker" | "trainer" = body?.audience === "trainer" ? "trainer" : "worker";

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

    const llm = makeLLM(req.headers);
    const systemPrompt = audience === "worker" ? WORKER_PROMPT : TRAINER_PROMPT;
    const userPrompt = `培训材料标题：《${material.title}》\n\n以下是原始材料内容（可能截断）：\n${material.content_text.slice(0, 12000)}\n\n请依据以上内容输出 Markdown 提纲。`;

    const response = await llm.invoke(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      { model: DEFAULT_MODEL, temperature: 0.5 },
    );

    const content_md = response.content?.trim();
    if (!content_md) return NextResponse.json({ error: "生成结果为空" }, { status: 500 });

    // 覆盖同 audience 的旧提纲
    await client.from("outlines").delete().eq("material_id", id).eq("audience", audience);

    // 命名标准化：「材料名称」培训提纲（工人版/培训师版）
    const outlineTitle = `《${material.title}》培训提纲（${audience === "worker" ? "工人版" : "培训师版"}）`;

    // 生成后自动发布（AI 生成即已发布，管理员仍可编辑）
    const { data: inserted, error: iErr } = await client
      .from("outlines")
      .insert({
        material_id: id,
        audience,
        content_md,
        title: outlineTitle,
        status: "published",
      })
      .select("id, audience, title, content_md, status, created_at")
      .single();
    if (iErr) return NextResponse.json({ error: iErr.message }, { status: 500 });

    return NextResponse.json({ outline: inserted });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
