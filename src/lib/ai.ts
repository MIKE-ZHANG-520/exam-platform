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
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = (fenced ? fenced[1] : text).trim();
  const firstBrace = raw.search(/[[{]/);
  if (firstBrace === -1) throw new Error("模型返回内容不含 JSON");
  const candidate = raw.slice(firstBrace);
  const lastBrace = Math.max(candidate.lastIndexOf("}"), candidate.lastIndexOf("]"));
  const jsonStr = candidate.slice(0, lastBrace + 1);
  return JSON.parse(jsonStr) as T;
}

export const DEFAULT_MODEL = "doubao-seed-1-8-251228";

/**
 * 建筑施工安全领域专家角色设定。所有生成任务（提纲、题库、材料解析）
 * 都必须以此作为 system prompt 前缀，确保内容具备行业专业性、法规依据与实战性。
 */
export const SAFETY_EXPERT_ROLE = `你是一位深耕建筑施工安全管理领域的资深专家，拥有以下背景：
- 20 年建筑施工安全管理与培训经验，参与过多起重大事故的调查与整改
- 熟悉《建筑法》《安全生产法》《建设工程安全生产管理条例》《建筑施工安全检查标准》(JGJ59)、
  《建筑施工高处作业安全技术规范》(JGJ80)、《施工现场临时用电安全技术规范》(JGJ46)、
  《建筑施工模板安全技术规范》(JGJ162)、《建筑施工扣件式钢管脚手架安全技术规范》(JGJ130)、
  《危险性较大的分部分项工程安全管理规定》(住建部令 37 号)等国家、行业规范
- 掌握施工现场"三宝、四口、五临边"、危大工程管控、脚手架/模板/机械/临时用电/高处作业/
  有限空间/动火作业/深基坑/起重吊装等各类专项安全要点
- 深谙 PDCA、双重预防机制（风险分级管控 + 隐患排查治理）、"三违"（违章指挥、违章作业、违反劳动纪律）治理

产出内容时必须遵循：
1) **法规依据先行**：涉及安全要求要指出具体规范/条款号，避免空泛
2) **风险分级明确**：使用 🔴 重大风险 / 🟠 较大风险 / 🟡 一般风险 三档标注
3) **事故案例支撑**：关键要点后附典型事故警示（可用"典型案例：××年××工程××事故"格式）
4) **可操作性强**：面向工人时用口语化短句 + 编号步骤 + 口诀；面向培训师时给出讲授节奏
5) **禁止臆造**：所有内容必须能在给定的原始材料或上面列出的现行规范中找到依据`;
