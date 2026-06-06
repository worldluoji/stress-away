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

export async function chatWithAI(
  messages: ChatMessage[],
  scenarioId?: string | null
): Promise<string> {
  const config = getModelConfig();
  const apiKey = process.env[config.apiKeyEnv];

  if (!apiKey) {
    throw new Error(`${config.apiKeyEnv} is not configured`);
  }

  // 获取场景上下文
  const scenarioContext = scenarioId ? getScenarioContext(scenarioId) : '';
  const systemPrompt = scenarioContext
    ? SYSTEM_PROMPT_BASE + scenarioContext
    : SYSTEM_PROMPT_BASE;

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

// 导出基础 system prompt 供其他地方使用
export { SYSTEM_PROMPT_BASE };