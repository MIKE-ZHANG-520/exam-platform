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

【任务】面向一线工人，基于原始材料输出**建筑施工安全**培训提纲。要求：

一、结构（严格执行）
1. 全篇不少于 5 个二级章节，每个用 "## 章节标题" 开头。标题必须以短句+口诀式表达，例如：
   "## 上岗前查这三样"、"## 高处作业系稳三件套"、"## 临时用电三级配电两级保护"。
2. 每个章节开头一行**风险等级徽章**：格式为 "> 🔴 重大风险 · 违规后果说明" 或 "> 🟠 较大风险 · ..." 或 "> 🟡 一般风险 · ..."（选一个最贴合的等级）。
3. 章节内容按类型输出条目（每条独占一行）：
   - "✅ 正确做法：xxx"（要点+对应规范条款号，例如"依据 JGJ80-2016 第 4.1.5 条"）
   - "⚠️ 注意事项：xxx"（作业细节 / 常见忽视点）
   - "🔴 禁止行为：xxx"（安全红线 / 三违行为）
   - "1️⃣ 2️⃣ 3️⃣ ..." 或 "① ② ③"（分步骤操作时使用）
   - "**重点**：xxx"（关键短语用 **加粗** 包裹）
4. 每个章节末尾必须附**典型事故案例警示**（一行）：
   "🚨 典型案例：××年××工程发生××事故（原因：××；后果：××人伤亡）"
   若原始材料未提供具体案例，可以用行业公开的通用事故类型描述。
5. 每个章节末尾还要有**口诀**：
   "> 💡 口诀：xxxxx（8-16 字，朗朗上口）"

二、内容深度
- 每条要点必须落到"做什么 / 怎么做 / 为什么"三要素之一
- 涉及数值必须给出具体数字（如"安全带高挂低用，坠落高度 ≥ 2m 必须使用"）
- 涉及设备/工具的必须写出型号或参数要求
- 覆盖建筑施工八大类专项安全要点中至少 3 类

三、输出格式
- 全部使用 Markdown 语法
- 不出现表格、代码块
- 内容必须紧扣给定材料，禁止编造与材料主题无关的规范`;

const TRAINER_PROMPT = `${SAFETY_EXPERT_ROLE}

【任务】面向培训讲师，基于原始材料输出**建筑施工安全**授课备课手册。要求：

一、开头必备
- 第一行给出 "**总时长建议：xx 分钟**"（一般 45-90 分钟）
- 第二行给出 "**受众建议**：xxx（岗位、工种、班组类型）"
- 第三行 "**核心目标**：xxx；xxx；xxx（不超过 3 条）"

二、结构（严格执行）
1. 划分至少 4 个 "## 章节标题" 章节。
2. 每章开头一行**风险等级徽章**："> 🔴 重大风险 · ..." / "> 🟠 较大风险 · ..." / "> 🟡 一般风险 · ..."
3. 每章内部按下面固定的六类结构编写（每类可有多条）：
   - "🎯 核心知识点：xxx（配规范条款号）"
   - "⚠️ 常见误区：xxx（施工现场常见错误做法及后果）"
   - "🚨 事故案例导入：xxx（简述近年典型事故：单位/年份/伤亡/原因，用于开场提问）"
   - "🖼️ 现场图片展示建议：xxx（描述应展示的现场对比图/示意图，如"合格 vs 不合格脚手架搭设"）"
   - "💬 互动设问：xxx？（引发学员思考的问题）"
   - "🧪 互动演练安排：xxx（如角色扮演、案例讨论、现场模拟操作演练，包含时长）"
   - "⏱️ 时间分配：xx 分钟 —— 说明"

三、内容深度
- 引用具体规范：JGJ80、JGJ46、JGJ130、JGJ59、JGJ162、JGJ33、JGJ160 等
- 每章"事故案例导入"必须与本章主题匹配
- 演练环节必须具体、可执行

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
        reviewed_by: sess.id,
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
