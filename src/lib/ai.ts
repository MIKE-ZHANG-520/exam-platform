import "dotenv/config";

/* ──────────────────────────────────────────────
 *  Coze Bot HTTP API 封装
 *  替代 coze-coding-dev-sdk，直接通过 HTTP 调用 EHSClaw Bot
 * ────────────────────────────────────────────── */

const COZE_API_BASE = process.env.COZE_API_BASE_URL || "https://api.coze.cn";
const COZE_API_TOKEN = process.env.COZE_WORKLOAD_API_TOKEN || "";
const EHSLAW_BOT_ID = "7634147783964639247";

/** Bot 聊天消息条目 */
interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** FetchClient 返回类型（与原 SDK 保持兼容） */
interface FetchResponse {
  status_code: number;
  status_message?: string;
  content?: Array<{ type: string; text?: string }>;
}

/** LLM 响应类型（与原 SDK 保持兼容） */
interface LLMResponse {
  content: string;
}

/**
 * 调用 EHSClaw Bot 进行对话，返回完整回复文本。
 *
 * 内部流程：
 *  1. POST /v3/chat  创建对话
 *  2. 轮询 GET /v3/chat/retrieve  直到 status=completed
 *  3. GET /v3/chat/message/list  获取回复内容
 */
export async function generateText(
  messages: ChatMessage[],
  _opts?: { temperature?: number; model?: string },
): Promise<string> {
  if (!COZE_API_TOKEN) {
    throw new Error("COZE_WORKLOAD_API_TOKEN 未配置，无法调用 AI 服务");
  }

  // 将 system + user 合并为单条 user message（Bot API 只接收 user 角色消息）
  const systemMsg = messages.find((m) => m.role === "system");
  const userMsg = messages.find((m) => m.role === "user") || messages[messages.length - 1];
  const combined = systemMsg
    ? `${systemMsg.content}\n\n---\n\n${userMsg.content}`
    : userMsg.content;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${COZE_API_TOKEN}`,
    "Content-Type": "application/json",
  };

  // 1. 创建对话
  const createResp = await fetch(`${COZE_API_BASE}/v3/chat`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      bot_id: EHSLAW_BOT_ID,
      user_id: "exam_platform",
      stream: false,
      auto_save_history: true,
      additional_messages: [{ role: "user", content: combined, content_type: "text" }],
    }),
  });

  if (!createResp.ok) {
    const errText = await createResp.text().catch(() => "unknown");
    throw new Error(`Bot 创建对话失败(${createResp.status}): ${errText.slice(0, 200)}`);
  }

  const createData = await createResp.json();
  const chatId = createData?.data?.id;
  const conversationId = createData?.data?.conversation_id;

  if (!chatId) {
    throw new Error(`Bot 创建对话返回异常: ${JSON.stringify(createData).slice(0, 200)}`);
  }

  // 2. 轮询对话状态（最多等待 180 秒）
  const maxPoll = 60;
  const pollInterval = 3000; // 3 秒
  for (let i = 0; i < maxPoll; i++) {
    await sleep(pollInterval);

    const statusUrl = `${COZE_API_BASE}/v3/chat/retrieve?chat_id=${chatId}&conversation_id=${conversationId}`;
    const statusResp = await fetch(statusUrl, { headers });
    if (!statusResp.ok) continue;

    const statusData = await statusResp.json();
    const status = statusData?.data?.status;

    if (status === "completed" || status === "failed" || status === "requires_action") {
      break;
    }
  }

  // 3. 获取回复消息列表
  const msgUrl = `${COZE_API_BASE}/v3/chat/message/list?chat_id=${chatId}&conversation_id=${conversationId}`;
  const msgResp = await fetch(msgUrl, { headers });
  if (!msgResp.ok) {
    throw new Error(`获取回复失败(${msgResp.status})`);
  }

  const msgData = await msgResp.json();
  const messages_list = msgData?.data || [];

  // 找到 type=answer 的消息（Bot 的最终回复）
  const answer = messages_list.find((m: { type: string; content: string }) => m.type === "answer");
  if (!answer || !answer.content) {
    throw new Error("Bot 未返回有效回复内容");
  }

  return answer.content as string;
}

/**
 * 兼容旧接口：返回类似 LLMClient 的对象。
 * outline / questions / parse 路由使用 llm.invoke(messages, opts) 调用。
 */
export function makeLLM(_headers?: Headers): {
  invoke: (messages: ChatMessage[], opts?: { temperature?: number; model?: string }) => Promise<LLMResponse>;
} {
  return {
    invoke: async (messages: ChatMessage[], opts?: { temperature?: number; model?: string }) => {
      const content = await generateText(messages, opts);
      return { content };
    },
  };
}

/**
 * 通过 Coze API 解析文件内容（FetchClient 替代）。
 * 使用 /v1/ai_extension/fetch 接口解析文件 URL。
 */
export function makeFetch(_headers?: Headers): { fetch: (url: string) => Promise<FetchResponse> } {
  return {
    fetch: async (url: string): Promise<FetchResponse> => {
      if (!COZE_API_TOKEN) {
        throw new Error("COZE_WORKLOAD_API_TOKEN 未配置");
      }

      const resp = await fetch(`${COZE_API_BASE}/v1/ai_extension/fetch`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${COZE_API_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url }),
      });

      if (!resp.ok) {
        const errText = await resp.text().catch(() => "unknown");
        return {
          status_code: resp.status,
          status_message: `文件解析失败: ${errText.slice(0, 200)}`,
          content: [],
        };
      }

      const data = await resp.json();
      // Coze fetch API 返回格式适配
      const text = data?.data?.content || data?.content || "";
      if (!text) {
        return {
          status_code: 0,
          content: [],
        };
      }

      return {
        status_code: 0,
        content: [{ type: "text", text }],
      };
    },
  };
}

/**
 * 让模型直接返回 JSON。尝试解析被 ```json 包裹的代码块或裸 JSON。
 */
export function extractJson<T = unknown>(text: string): T {
  if (!text) throw new Error("模型返回内容为空");
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = (fenced ? fenced[1] : text).trim();
  const firstBrace = raw.search(/[[{]/);
  if (firstBrace === -1) throw new Error("模型返回内容不含 JSON");
  const candidate = raw.slice(firstBrace);

  // 1. 尝试找到完整的 JSON（正常情况）
  const lastClose = Math.max(candidate.lastIndexOf("}"), candidate.lastIndexOf("]"));
  if (lastClose > 0) {
    try {
      return JSON.parse(candidate.slice(0, lastClose + 1)) as T;
    } catch {
      // 继续到下面的截断修复逻辑
    }
  }

  // 2. 截断修复：如果 JSON 数组被截断（如模型输出超过 max_tokens）
  //    尝试找到最后一个完整对象的 } 闭合位置，截断后补上 ]
  if (candidate.startsWith("[")) {
    let depth = 0;
    let lastValidEnd = -1;
    let inString = false;
    let escape = false;

    for (let i = 0; i < candidate.length; i++) {
      const ch = candidate[i];
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === "\\") {
        escape = true;
        continue;
      }
      if (ch === '"') {
        inString = !inString;
        continue;
      }
      if (inString) continue;

      if (ch === "{") depth++;
      if (ch === "}") {
        depth--;
        if (depth === 0) {
          lastValidEnd = i;
        }
      }
    }

    if (lastValidEnd > 0) {
      const truncated = candidate.slice(0, lastValidEnd + 1);
      const cleaned = truncated.replace(/,\s*$/, "");
      try {
        return JSON.parse(cleaned + "]") as T;
      } catch {
        // 最后兜底
      }
    }
  }

  // 3. 最后兜底：尝试直接 parse 原始文本
  try {
    return JSON.parse(candidate) as T;
  } catch (e) {
    const em = e instanceof Error ? e.message : String(e);
    throw new Error(`JSON 解析失败: ${em}（内容前 200 字: ${candidate.slice(0, 200)}）`);
  }
}

export const DEFAULT_MODEL = "doubao-seed-1-8-251228";

/**
 * 建筑施工安全领域专家角色设定。
 */
export const SAFETY_EXPERT_ROLE = `你是一位拥有 20 年经验的建筑施工安全管理专家，精通以下领域：
- 建筑施工安全生产法律法规：《建筑法》《安全生产法》《建设工程安全生产管理条例》
- 建筑施工安全检查标准（JGJ59-2011）
- 危险性较大的分部分项工程安全管理规定（住建部令 37 号）
- 高处作业（JGJ80-2016）、临边洞口防护、脚手架工程（JGJ130-2011）、模板支撑体系（JGJ162-2008）
- 施工现场临时用电（JGJ46-2005）、起重吊装、施工机具（GB5144-2006 塔式起重机安全规程等）、消防防火
- 安全文明施工、安全教育培训、事故应急处理
- 三违行为识别（违章指挥、违章作业、违反劳动纪律）
- 安全红线、安全禁令、"十条禁令"等企业安全管理制度
- "三宝、四口、五临边"防护、危大工程管控、双重预防机制（风险分级管控 + 隐患排查治理）

【生成要求，必须严格遵守】
1) **符合现行规范**：所有内容必须符合现行国家和行业标准，禁止臆造
2) **法规依据先行**：安全要求必须引用具体规范/条款编号（如 JGJ59-2011 第 3.1.4 条、GB5144-2006、JGJ80-2016 第 6.1.2 条等）
3) **风险分级明确**：使用 🔴 重大风险 / 🟠 较大风险 / 🟡 一般风险 三档标注，重点关注高处坠落、物体打击、触电、机械伤害、坍塌等致死性作业风险
4) **场景化出题**：题目必须结合施工现场真实情境，避免死记硬背的偏题
5) **迷惑性错误选项**：单选/多选的错误选项要贴近现场常见错误做法，具备迷惑性，选项之间保持相似性
6) **判断题现场化**：判断题以现场常见错误做法为题干，让考生判断对错
7) **多选题综合化**：多选题考察综合判断能力，围绕一个场景考多个安全措施
8) **事故案例支撑**：关键要点后附典型事故警示
9) **可操作性**：面向工人用口语化短句 + 编号步骤 + 口诀；面向培训师给出讲授节奏与互动演练建议
10) **禁止臆造**：所有条款号、案例、数据必须真实可查，不确定的宁可不写`;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
