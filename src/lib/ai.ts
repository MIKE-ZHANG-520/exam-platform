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
    throw new Error("COZE_WORKLOAD_API_TOKEN 未配置，无法调用 AI 服务");
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
 * 建筑施工安全领域"现行有效"的国家/行业标准与法规清单（人工核对至 2026 年）。
 * Prompt 强制 Bot 只从此列表中引用，禁止引用已废止版本（如 JGJ46-2005）。
 * 后续法规更新时，只需在此处增删条目即可，不用改多个 Prompt。
 */
export const CURRENT_REGULATIONS = `
【建筑施工安全 · 现行有效 法规/标准 白名单（引用必须从此表选择，禁止使用已废止旧版）】

一、行业标准（JGJ 系列，住建部）
- JGJ 80-2016《建筑施工高处作业安全技术规范》
- JGJ 46-2024《施工现场临时用电安全技术标准》（2024 年替代已废止的 JGJ46-2005，禁止再引用 2005 版）
- JGJ 130-2011《建筑施工扣件式钢管脚手架安全技术规范》
- JGJ 128-2010《建筑施工门式钢管脚手架安全技术规范》
- JGJ 202-2010《建筑施工工具式脚手架安全技术规范》
- JGJ 231-2010《建筑施工承插型盘扣式钢管支架安全技术规程》
- JGJ 162-2008《建筑施工模板安全技术规范》
- JGJ 33-2012《建筑机械使用安全技术规程》
- JGJ 59-2011《建筑施工安全检查标准》
- JGJ 276-2012《建筑施工起重吊装工程安全技术规范》
- JGJ 300-2013《建筑施工临时支撑结构技术规范》
- JGJ 311-2013《建筑深基坑工程施工安全技术规范》
- JGJ/T 429-2018《建筑施工易发事故防治安全标准》

二、国家标准（GB 系列）
- GB 5144-2006《塔式起重机安全规程》
- GB/T 5031-2019《塔式起重机》
- GB 50656-2011《施工企业安全生产管理规范》
- GB 50194-2014《建设工程施工现场供用电安全规范》
- GB 6095-2021《坠落防护安全带》
- GB 2811-2019《头部防护 安全帽》
- GB/T 3608-2008《高处作业分级》

三、法律法规 / 部门规章
- 《中华人民共和国安全生产法》（2021 年修正）
- 《中华人民共和国建筑法》（2019 年修正）
- 《建设工程安全生产管理条例》（国务院令第 393 号，2004 年，现行）
- 《危险性较大的分部分项工程安全管理规定》（住建部令第 37 号，2018 年，现行）
- 《生产安全事故报告和调查处理条例》（国务院令第 493 号，2007 年）
- 《特种作业人员安全技术培训考核管理规定》（应急管理部令第 30 号，2015 年，2023 年修正）

【硬性规则】
1. 只能引用以上列表中的标准编号和版本号，一字不改；不确定版本时用类别名（如"临时用电规范"）而不要瞎写年份。
2. 严禁引用列表外的编号（如虚构的 GB 5144-2024、JGJ46-2005 等废止版本）。
3. 每次引用规范时必须写完整编号+年份+中文名（如"JGJ 80-2016《建筑施工高处作业安全技术规范》"）。
`.trim();

export const SAFETY_EXPERT_ROLE = `你是深耕建筑施工安全的资深专家（EHSClaw Bot），熟悉国标 GB/JGJ 系列规范、住建部安全生产条例、真实事故案例库。你的表达要贴近一线工人：讲事故、用大白话、提口诀、给具体动作。避免空泛术语堆砌。

${CURRENT_REGULATIONS}`;
