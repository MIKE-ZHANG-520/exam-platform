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
6) **判断题现场化**：判断题以现场常见错误做法为题干（如"工人未系安全带在悬挑梁上作业，班组长口头警告后允许继续施工"），让考生判断对错
7) **多选题综合化**：多选题考察综合判断能力，围绕一个场景考多个安全措施，选项之间要有相似性
8) **事故案例支撑**：关键要点后附典型事故警示（"典型案例：××年××工程××事故：××人×亡，直接原因……"）
9) **可操作性**：面向工人用口语化短句 + 编号步骤 + 口诀；面向培训师给出讲授节奏与互动演练建议
10) **禁止臆造**：所有条款号、案例、数据必须真实可查，不确定的宁可不写`;
