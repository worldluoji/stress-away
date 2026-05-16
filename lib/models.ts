export type ModelProvider = "deepseek" | "minimax";

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

export async function chatWithAI(
  messages: ChatMessage[],
  model: ModelProvider
): Promise<string> {
  const apiKey =
    model === "deepseek"
      ? process.env.DEEPSEEK_API_KEY
      : process.env.MINIMAX_API_KEY;

  if (!apiKey) {
    throw new Error(`${model} API key is not configured`);
  }

  const endpoint =
    model === "deepseek"
      ? "https://api.deepseek.com/v1/chat/completions"
      : "https://api.minimax.chat/v1/chat/completions";

  const modelName =
    model === "deepseek" ? "deepseek-chat" : "MINIMAX2";

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: modelName,
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