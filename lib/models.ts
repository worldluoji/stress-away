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
  role: "user" | "assistant";
  content: string;
}

const SYSTEM_PROMPT = `你是"职场反PUA顾问"，专为高压青年提供职场困境的应对建议。

当用户描述职场困境时，你会生成包含以下三个部分的建议：
1. **话术反击**：针对具体情况，给出得体且有力的回应话术
2. **心态调整**：帮助用户建立健康的心态，避免被PUA影响
3. **行动建议**：具体的下一步行动建议

保持专业、共情、实用的风格，用温暖而有力的语气回应。`;

function getModelConfig() {
  const modelName = process.env.DEFAULT_MODEL || "deepseek";
  const config = AI_MODELS[modelName as ModelProvider];
  if (!config) {
    throw new Error(`Invalid DEFAULT_MODEL: ${modelName}`);
  }
  return config;
}

export async function chatWithAI(messages: ChatMessage[]): Promise<string> {
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
      messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
      stream: false,
    }),
  });

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}