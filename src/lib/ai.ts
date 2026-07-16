import "dotenv/config";

/* ──────────────────────────────────────────────
 *  Coze Bot HTTP API 封装
 *  提供两种模式：
 *   1) generateText  —— 一次性等待完成（旧接口，用于短文本如 outline 生成）
 *   2) startChat + pollChat + fetchAnswer —— 分离的异步流程（用于长任务如题库生成）
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

function botHeaders(): Record<string, string> {
  if (!COZE_API_TOKEN) {
    throw new Error("COZE_WORKLOAD_API_TOKEN 未配置，无法调用才子佳人服务");
  }
  return {
    Authorization: `Bearer ${COZE_API_TOKEN}`,
    "Content-Type": "application/json",
  };
}

function mergeMessages(messages: ChatMessage[]): string {
  const systemMsg = messages.find((m) => m.role === "system");
  const userMsg = messages.find((m) => m.role === "user") || messages[messages.length - 1];
  return systemMsg ? `${systemMsg.content}\n\n---\n\n${userMsg.content}` : userMsg.content;
}

/* ─────────── 分离式调用（用于超长任务，避免网关超时） ─────────── */

export interface ChatHandle {
  chatId: string;
  conversationId: string;
}

/**
 * 只创建 Bot 对话，立即返回 chat_id（<2s），不等待完成。
 * 前端后续轮询 pollChat 查询状态。
 */
export async function startChat(messages: ChatMessage[]): Promise<ChatHandle> {
  const headers = botHeaders();
  const content = mergeMessages(messages);

  const resp = await fetch(`${COZE_API_BASE}/v3/chat`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      bot_id: EHSLAW_BOT_ID,
      user_id: "exam_platform",
      stream: false,
      auto_save_history: true,
      additional_messages: [{ role: "user", content, content_type: "text" }],
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => "unknown");
    throw new Error(`Bot 创建对话失败(${resp.status}): ${errText.slice(0, 200)}`);
  }

  const data = await resp.json();
  const chatId = data?.data?.id;
  const conversationId = data?.data?.conversation_id;
  if (!chatId || !conversationId) {
    throw new Error(`Bot 创建对话返回异常: ${JSON.stringify(data).slice(0, 200)}`);
  }
  return { chatId, conversationId };
}

/**
 * 查询 chat 状态。快速返回（<2s）。
 * status: in_progress | completed | failed | requires_action | canceled | created
 */
export async function pollChat(
  handle: ChatHandle,
): Promise<{ status: string; ready: boolean }> {
  const headers = botHeaders();
  const url = `${COZE_API_BASE}/v3/chat/retrieve?chat_id=${handle.chatId}&conversation_id=${handle.conversationId}`;
  const resp = await fetch(url, { headers });
  if (!resp.ok) {
    return { status: "unknown", ready: false };
  }
  const data = await resp.json();
  const status: string = data?.data?.status || "unknown";
  const ready = status === "completed" || status === "failed" || status === "requires_action";
  return { status, ready };
}

/**
 * 拉取 Bot 的最终回复文本。仅在 pollChat 返回 ready=true 后调用。
 */
export async function fetchAnswer(handle: ChatHandle): Promise<string> {
  const headers = botHeaders();
  const url = `${COZE_API_BASE}/v3/chat/message/list?chat_id=${handle.chatId}&conversation_id=${handle.conversationId}`;
  const resp = await fetch(url, { headers });
  if (!resp.ok) {
    throw new Error(`获取回复失败(${resp.status})`);
  }
  const data = await resp.json();
  const messages_list = data?.data || [];
  const answer = messages_list.find((m: { type: string; content: string }) => m.type === "answer");
  if (!answer || !answer.content) {
    throw new Error("Bot 未返回有效回复内容");
  }
  return answer.content as string;
}

/* ─────────── 同步式调用（原 API，用于短任务如 outline） ─────────── */

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 一次性同步调用：内部 start + poll + fetch。
 * 仅用于短任务（如 outline 生成，输出 <2000 字），可能耗时 30-60s。
 * 长任务请使用 startChat/pollChat/fetchAnswer 分离流程。
 */
export async function generateText(
  messages: ChatMessage[],
  _opts?: { temperature?: number; model?: string },
): Promise<string> {
  const handle = await startChat(messages);
  const maxPoll = 40;
  const pollInterval = 1500;
  let finalStatus = "";
  for (let i = 0; i < maxPoll; i++) {
    await sleep(pollInterval);
    const { status, ready } = await pollChat(handle);
    if (ready) {
      finalStatus = status;
      break;
    }
  }
  if (!finalStatus) throw new Error("Bot 响应超时（60s 内未完成）");
  if (finalStatus === "failed") throw new Error("Bot 生成失败");
  return await fetchAnswer(handle);
}

/**
 * 兼容旧接口：返回类似 LLMClient 的对象。
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
        body: JSON.stringify({ url, extract_text: true }),
      });

      if (!resp.ok) {
        return { status_code: resp.status, status_message: `HTTP ${resp.status}` };
      }

      const data = await resp.json();
      const text = data?.data?.content || data?.data?.text || data?.data?.extracted_text || "";
      return {
        status_code: 200,
        content: [{ type: "text", text: String(text) }],
      };
    },
  };
}

/* ─────────── 通用工具 ─────────── */

/** 从 LLM 输出中提取 JSON（支持 markdown 代码块、末尾截断修复） */
export function extractJson<T>(raw: string): T {
  const trimmed = raw.trim();

  // 移除 markdown 代码块标记
  const withoutFence = trimmed.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();

  // 尝试直接解析
  try {
    return JSON.parse(withoutFence) as T;
  } catch {
    /* continue */
  }

  // 提取第一个 [...] 或 {...}
  const arrayStart = withoutFence.indexOf("[");
  const objStart = withoutFence.indexOf("{");

  let startIdx = -1;
  let isArray = false;
  if (arrayStart >= 0 && (objStart < 0 || arrayStart < objStart)) {
    startIdx = arrayStart;
    isArray = true;
  } else if (objStart >= 0) {
    startIdx = objStart;
    isArray = false;
  }

  if (startIdx < 0) throw new Error("未找到 JSON 起始标记");

  // 找最后完整闭合位置
  const endChar = isArray ? "]" : "}";
  const lastEnd = withoutFence.lastIndexOf(endChar);

  if (lastEnd > startIdx) {
    const candidate = withoutFence.slice(startIdx, lastEnd + 1);
    try {
      return JSON.parse(candidate) as T;
    } catch {
      /* continue */
    }
  }

  // 修复末尾截断：数组场景下，扫描找最后完整对象
  if (isArray) {
    const body = withoutFence.slice(startIdx);
    let depth = 0;
    let inStr = false;
    let escape = false;
    let lastObjEnd = -1;

    for (let i = 0; i < body.length; i++) {
      const c = body[i];
      if (escape) {
        escape = false;
        continue;
      }
      if (c === "\\") {
        escape = true;
        continue;
      }
      if (c === '"') {
        inStr = !inStr;
        continue;
      }
      if (inStr) continue;
      if (c === "{") depth++;
      else if (c === "}") {
        depth--;
        if (depth === 0) lastObjEnd = i;
      }
    }

    if (lastObjEnd > 0) {
      const patched = body.slice(0, lastObjEnd + 1) + "]";
      try {
        return JSON.parse(patched) as T;
      } catch {
        /* continue */
      }
    }
  }

  throw new Error("JSON 解析失败");
}

/* ─────────── 建筑安全领域预设 ─────────── */

export const DEFAULT_MODEL = "ehs-claw-bot";

/**
 * 法规引用规则 · 底线：绝不允许 AI 凭记忆猜标准编号/年份
 *
 * 三层引用优先级（严格自上而下）：
 *   1. 材料原文里已明确出现的法规 —— 可以照抄编号+年份+名称
 *   2. 用户上传原文没有的 —— 只写"分类通用名"（如"高处作业安全规范"），不要写具体编号年份
 *   3. 任何情况下，不确定的一律省略，宁缺毋滥
 */
export const REGULATION_CITATION_RULES = `
【法规/标准引用 · 硬底线规则】

一、优先级
1) 首选：只引用【上传材料原文】里已明确出现的标准编号+年份+名称，可以照抄。
2) 次选：材料原文没提到、但确实需要标注类别时，只用中文通用名（例："高处作业安全规范"、"临时用电安全标准"、"塔机安全规程"、"安全生产法"），不写具体编号年份。
3) 兜底：任何拿不准的、无法从原文核实的、时效性存疑的，一律省略，不要引用。

二、绝对禁止（触碰即视为严重错误）
- 禁止凭记忆/训练数据【自行补充】任何具体的标准编号（如 GB xxx / JGJ xxx / GB/T xxx）
- 禁止凭记忆【自行补充】任何标准的发布年份或版本号
- 禁止引用已废止的旧版本（比如 JGJ 46-2005 已被 2024 年新版替代）
- 禁止把类似名称的标准搞混（不要把 GB 换成 JGJ，不要把国标编号写成企业标准编号）
- 禁止编造不存在的编号（如 GB 5144-2024、JGJ 80-2020 这类幻想出来的年份）

三、输出格式
- 引用材料原文里的法规时：完整照抄（编号+年份+《中文名》）
- 只用类别通用名时：直接写中文名，不要加任何"（编号待核实）"这类标注
- 提取到 regulations/clauses 字段时，只把【材料原文明确出现】的写进去，材料没提的字段留空数组 []

底线：法规版本是安全培训的生命线。宁可少写、留白，也不许出错。用户会把这个内容用于真实的工人安全培训，一条过期或错误的引用可能导致培训方向错误、责任事故追溯困难。
`.trim();

export const SAFETY_EXPERT_ROLE = `你是深耕建筑施工安全的资深专家（EHSClaw Bot），熟悉真实事故案例、一线工人现场作业细节。你的表达要贴近一线工人：讲事故、用大白话、提口诀、给具体动作。避免空泛术语堆砌。

${REGULATION_CITATION_RULES}`;
