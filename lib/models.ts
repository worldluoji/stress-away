export const AI_MODELS = {
  deepseek: {
    name: 'DeepSeek V4 Flash',
    endpoint: 'https://api.deepseek.com/v1/chat/completions',
    model: 'deepseek-v4-flash',
    apiKeyEnv: 'DEEPSEEK_API_KEY',
  },
  minimax: {
    name: 'MiniMax M2.7',
    endpoint: 'https://api.minimax.chat/v1/chat/completions',
    model: 'MiniMax-M2.7',
    apiKeyEnv: 'MINIMAX_API_KEY',
  },
} as const;

export type ModelProvider = keyof typeof AI_MODELS;

export interface ChatMessage {
  id?: string;       // auto-generated unique id
  role: "user" | "assistant";
  content: string;
}

export function generateMessageId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

import { getScenarioById } from './scenarios';
import type { CompBreakdown } from './compensation';

const SYSTEM_PROMPT_BASE = `你是"职场反PUA顾问"，专为高压青年提供职场困境的应对建议。

当用户描述职场困境时，请严格按照以下四个部分输出，**每个部分用标题分隔**：

## 话术反击
针对用户描述的具体情况，给出得体且有力的回应话术。包括：
- 温和版：给对方台阶下的沟通方式
- 犀利版：明确立场、有理有据的反击方式
- 根据用户提供的细分情况（如场合、严重程度、具体话术等），调整话术的力度和措辞

## 心态调整
帮助用户：
1. 识破对方的操控逻辑（领导/同事为什么要这样做）
2. 建立健康的心态框架（这类问题的本质是什么）
3. 避免被PUA影响情绪和判断

## 行动建议
给出 3-5 条具体可执行的行动步骤，按优先级排序，包括：
- 立即可以做的事（今天）
- 短期需要做的事（一周内）
- 必要时保留的证据

## 法律参考
给出该场景相关的劳动法条文或法律依据，帮助用户了解自己的权益底线。如果涉及赔偿、解除、加班费等核心权益，给出具体的计算方式和法律条款。

**格式要求**：
- 每个部分用 ## 标题分隔
- 话术用「」或""包裹对话原文
- 法律条文要精确，引用具体条款编号
- 语气专业但温暖，不要说教

保持专业、共情、实用的风格。`;

// 场景模板上下文
function getScenarioContext(scenarioId: string): string {
  const scenario = getScenarioById(scenarioId);
  if (!scenario) return '';

  return `

【当前场景参考】
场景：${scenario.name}
描述：${scenario.description}
话术模板：
${scenario.scripts.map((s, i) => `
${i + 1}. ${i === 0 ? '温和版' : '犀利版'}： "${s.mild}"
   效果：${s.effect}
`).join('')}
心态调整：${scenario.mindset}
证据收集：${scenario.evidence.join('、')}
法律参考：${scenario.lawRef}

请结合以上场景模板，给出更贴合该场景的定制化建议。`;
}

function getModelConfig() {
  const modelName = process.env.DEFAULT_MODEL || "deepseek";
  const config = AI_MODELS[modelName as ModelProvider];
  if (!config) {
    throw new Error(`Invalid DEFAULT_MODEL: ${modelName}`);
  }
  return config;
}

async function callModel(
  systemPrompt: string,
  messages: ChatMessage[]
): Promise<string> {
  const config = getModelConfig();
  const apiKey = process.env[config.apiKeyEnv];

  if (!apiKey) {
    throw new Error(`${config.apiKeyEnv} is not configured`);
  }

  const response = await fetch(config.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages: [{ role: "system", content: systemPrompt }, ...messages],
      stream: false,
    }),
  });

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status}`);
  }

  const data = await response.json();
  if (!data.choices?.length || !data.choices[0]?.message?.content) {
    throw new Error('Invalid API response: missing choices or content');
  }
  return data.choices[0].message.content;
}

export async function chatWithAI(
  messages: ChatMessage[],
  scenarioId?: string | null
): Promise<string> {
  const scenarioContext = scenarioId ? getScenarioContext(scenarioId) : '';
  const systemPrompt = scenarioContext
    ? SYSTEM_PROMPT_BASE + scenarioContext
    : SYSTEM_PROMPT_BASE;
  return callModel(systemPrompt, messages);
}

const REPORT_SYSTEM_PROMPT = `你是"劳动维权顾问"，为被裁员/欠薪/强制加班的劳动者生成一份完整的维权方案报告。

请严格按照以下五个部分输出，**每个部分用标题分隔**：

## 一、赔偿明细核对
逐项核对【计算结果】中的金额，解释每一项的法律依据（精确到条款编号）。金额必须与【计算结果】完全一致，禁止自行重新计算或修改数字。

## 二、证据清单
结合用户描述的情况，列出仲裁需要提交的具体证据及收集方式（什么材料、去哪拿、注意什么）。

## 三、仲裁流程与时间线
给出从立案到裁决的完整流程，关键时限必须准确：仲裁时效1年、受理决定5日、审期45日（可延长15日）、管辖的劳动仲裁委员会。

## 四、仲裁申请书草稿
按规范格式生成：标题、申请人信息、被申请人信息、请求事项（金额与【计算结果】一致）、事实与理由、落款。用户未提供的个人信息用【】占位。

## 五、风险与谈判策略
指出主张中可能被驳回的弱项、公司常见抗辩及应对，给出谈判底线建议（何时值得调解、调解金额怎么谈）。

**格式要求**：
- 每个部分用 ## 标题分隔
- 法律条文引用具体条款编号
- 金额用阿拉伯数字并带"元"
- 语气专业、克制，不夸大胜诉概率`;

export function buildReportSystemPrompt(): string {
  const scenario = getScenarioById('resignation-negotiation');
  if (!scenario) return REPORT_SYSTEM_PROMPT;
  return `${REPORT_SYSTEM_PROMPT}

【参考素材】
法律参考：${scenario.lawRef}
证据收集要点：${scenario.evidence.join('；')}`;
}

export function buildReportUserPrompt(
  breakdown: CompBreakdown,
  intakeAnswers: Record<string, string>,
  narrative: string
): string {
  const lines = [
    '【计算结果】',
    ...breakdown.lines.map((l) => `- ${l}`),
    ...breakdown.warnings.map((w) => `- ⚠️ ${w}`),
    `- 合计可主张：${breakdown.total} 元`,
    '',
    '【基本情况】',
    ...Object.entries(intakeAnswers).map(([k, v]) => `- ${k}：${v}`),
    '',
    '【事件经过】',
    narrative,
    '',
    '请据此生成完整维权方案报告。',
  ];
  return lines.join('\n');
}

export async function generateReport(
  breakdown: CompBreakdown,
  intakeAnswers: Record<string, string>,
  narrative: string
): Promise<string> {
  const userPrompt = buildReportUserPrompt(breakdown, intakeAnswers, narrative);
  return callModel(buildReportSystemPrompt(), [{ role: 'user', content: userPrompt }]);
}

// 导出基础 system prompt 供其他地方使用
export { SYSTEM_PROMPT_BASE };