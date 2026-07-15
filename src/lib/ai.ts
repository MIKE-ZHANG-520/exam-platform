import { LLMClient, Config, HeaderUtils, FetchClient } from "coze-coding-dev-sdk";

export function makeLLM(headers?: Headers): LLMClient {
  const config = new Config();
  const custom = headers ? HeaderUtils.extractForwardHeaders(headers) : undefined;
  return new LLMClient(config, custom);
}

export function makeFetch(headers?: Headers): FetchClient {
  const config = new Config();
  const custom = headers ? HeaderUtils.extractForwardHeaders(headers) : undefined;
  return new FetchClient(config, custom);
}

/**
 * 让模型直接返回 JSON。尝试解析被 ```json 包裹的代码块或裸 JSON。
 */
export function extractJson<T = unknown>(text: string): T {
  if (!text) throw new Error("模型返回内容为空");
  // 优先匹配 ```json ... ```
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = (fenced ? fenced[1] : text).trim();
  // 找第一个 { 或 [
  const firstBrace = raw.search(/[[{]/);
  if (firstBrace === -1) throw new Error("模型返回内容不含 JSON");
  const candidate = raw.slice(firstBrace);
  // 尝试从尾部裁剪多余字符：不断截取到最后一个 } 或 ]
  const lastBrace = Math.max(candidate.lastIndexOf("}"), candidate.lastIndexOf("]"));
  const jsonStr = candidate.slice(0, lastBrace + 1);
  return JSON.parse(jsonStr) as T;
}

export const DEFAULT_MODEL = "doubao-seed-1-8-251228";
