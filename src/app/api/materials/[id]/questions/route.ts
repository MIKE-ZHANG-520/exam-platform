import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { makeLLM, extractJson, DEFAULT_MODEL, SAFETY_EXPERT_ROLE } from "@/lib/ai";
import { requireSession } from "@/lib/auth";
import type { QuestionOption, QuestionType } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

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

const EXPLANATION_SPEC = `**解析必须包含四要素**（不能省略任何一项，用 " | " 分隔或多行输出）：
① 正确答案要点：为什么是这个答案
② 错误选项分析：其它选项错在哪
③ 规范依据：引用具体规范条款号（如"JGJ80-2016 第 4.2.3 条"、"《建设工程安全生产管理条例》第 21 条"）
④ 现场警示：如违反可能导致的事故类型或典型案例`;

const EASY_PROMPT = `${SAFETY_EXPERT_ROLE}

【任务】基于给定的建筑施工安全材料出**简易题库**共 40 道题，用于一线工人上岗培训考核。

一、题型与数量
- 20 道单选题（type: "single"）：4 个选项 A/B/C/D，只有 1 个正确答案
- 20 道判断题（type: "judge"）：选项固定 [{"key":"A","text":"正确"},{"key":"B","text":"错误"}]，answer 为 ["A"] 或 ["B"]

二、风险等级分布（必须严格达标）
- **高风险题（risk_level: "high"）占比 ≥ 40%**：必考的安全红线、致死性作业风险（高处坠落、坍塌、触电、机械伤害、起重伤害、火灾爆炸）
- 中风险题（risk_level: "medium"）约 35%：常见违章、防护缺失、程序不规范
- 低风险题（risk_level: "low"）约 25%：常识性、劳动纪律、标识识别

三、题型多样化要求
- 判断题里至少 5 道是**现场图片场景描述题**，题干以"现场场景：……请判断该做法是否正确"格式，具体描述一个施工现场画面（安全帽佩戴、脚手架搭设、临时用电、机械操作等）后让工人判断
- 单选题里至少 3 道涉及具体规范条款号（如"根据 JGJ80，安全带的正确使用高度为？"）

四、每题字段（**严格按此 JSON schema**）
{
  "type": "single" | "judge",
  "content": "题干（100 字内，紧扣工人实操场景）",
  "options": [{"key":"A","text":"..."},...],
  "answer": ["A"],
  "risk_level": "high" | "medium" | "low",
  "tag": "简短标签，如 '高处作业' / '临时用电' / '脚手架' / '模板工程' / '机械操作' / '劳动纪律' 等",
  "explanation": "含四要素的详细解析"
}

五、${EXPLANATION_SPEC}

六、输出严格 JSON 数组，禁止 Markdown 代码块外的任何说明文字。`;

const MEDIUM_PROMPT = `${SAFETY_EXPERT_ROLE}

【任务】基于给定的建筑施工安全材料出**中等题库**共 40 道，用于班组长/技术工人考核。

一、题型与数量
- 16 道单选题（type: "single"）：4 个选项 A/B/C/D，1 个正确答案
- 12 道多选题（type: "multiple"）：4 个选项 A/B/C/D，2-4 个正确答案。至少 6 道为**综合场景题**（题干先描述一个施工场景，再问该场景下正确/必须采取的多项措施）
- 12 道判断题（type: "judge"）：选项固定 [{"key":"A","text":"正确"},{"key":"B","text":"错误"}]。至少 4 道是现场图片场景描述题

二、题型强化要求
- 单选题里至少 3 道是**事故案例分析题**：题干先给出一起施工事故的简要经过，问事故直接原因/根本原因/应采取的措施
- 多选题里至少 3 道涉及**危大工程管控**（脚手架、模板支撑、深基坑、起重吊装、高处作业、临时用电等）
- 至少 5 道题必须引用具体规范条款

三、风险等级分布
- **高风险题（risk_level: "high"）占比 ≥ 40%**
- 中风险题约 35%
- 低风险题约 25%

四、每题字段
{
  "type": "single" | "multiple" | "judge",
  "content": "题干（案例题可 200 字内）",
  "options": [{"key":"A","text":"..."},...],
  "answer": ["A","C"],
  "risk_level": "high" | "medium" | "low",
  "tag": "如 '高处作业' / '危大工程' / '事故分析' / '临时用电' 等",
  "explanation": "含四要素的详细解析"
}

五、${EXPLANATION_SPEC}

六、输出严格 JSON 数组，禁止 Markdown 代码块外的任何说明文字。`;

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

// POST /api/materials/:id/questions
// body: { difficulty: 'easy' | 'medium' }
export async function POST(req: NextRequest, { params }: Params) {
  const sess = await requireSession();
  if (!sess) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const difficulty: "easy" | "medium" = body?.difficulty === "medium" ? "medium" : "easy";

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
    const systemPrompt = difficulty === "easy" ? EASY_PROMPT : MEDIUM_PROMPT;
    const userPrompt = `培训材料《${material.title}》：\n${material.content_text.slice(0, 14000)}\n\n请依据以上内容出题，严格按 JSON 数组格式输出。`;

    const response = await llm.invoke(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      { model: DEFAULT_MODEL, temperature: 0.6 },
    );

    let parsed: RawQuestion[];
    try {
      parsed = extractJson<RawQuestion[]>(response.content);
      if (!Array.isArray(parsed)) throw new Error("模型返回的不是 JSON 数组");
    } catch (e) {
      const em = e instanceof Error ? e.message : String(e);
      return NextResponse.json({ error: `解析题库 JSON 失败: ${em}` }, { status: 500 });
    }

    const cleaned = sanitizeQuestions(parsed);
    if (cleaned.length === 0) {
      return NextResponse.json({ error: "生成的题库为空" }, { status: 500 });
    }

    // 覆盖同类型旧题库
    const { data: oldBanks } = await client
      .from("question_banks")
      .select("id")
      .eq("material_id", id)
      .eq("difficulty", difficulty);
    if (oldBanks && oldBanks.length > 0) {
      const ids = oldBanks.map((b) => b.id);
      if (ids.length > 0) await client.from("question_banks").delete().in("id", ids);
    }

    // 命名标准化：「材料名称」培训题库（简易/中等）
    const bankTitle = `《${material.title}》培训题库（${difficulty === "easy" ? "简易" : "中等"}）`;

    // 生成后自动发布
    const { data: bank, error: bErr } = await client
      .from("question_banks")
      .insert({
        material_id: id,
        title: bankTitle,
        difficulty,
        total_count: cleaned.length,
        status: "published",
        reviewed_by: sess.id,
      })
      .select("id, title, difficulty, total_count, status, created_at")
      .single();
    if (bErr) return NextResponse.json({ error: bErr.message }, { status: 500 });

    const rows = cleaned.map((q, idx) => {
      const explanation = q.explanation
        ? q.risk_level && q.tag
          ? `【${riskLabel(q.risk_level)} · ${q.tag}】\n${q.explanation}`
          : q.explanation
        : null;
      return {
        bank_id: bank.id,
        type: q.type,
        content: q.content,
        options: q.options,
        answer: q.answer,
        explanation,
        order_no: idx + 1,
      };
    });

    // 分批插入
    const batchSize = 20;
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      const { error: qErr } = await client.from("questions").insert(batch);
      if (qErr) return NextResponse.json({ error: qErr.message }, { status: 500 });
    }

    // 统计风险分布，返回给前端
    const distribution = {
      high: cleaned.filter((q) => q.risk_level === "high").length,
      medium: cleaned.filter((q) => q.risk_level === "medium").length,
      low: cleaned.filter((q) => q.risk_level === "low").length,
    };

    return NextResponse.json({ bank, count: cleaned.length, distribution });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

function riskLabel(level: RiskLevel): string {
  if (level === "high") return "🔴 重大风险";
  if (level === "medium") return "🟠 较大风险";
  return "🟡 一般风险";
}
