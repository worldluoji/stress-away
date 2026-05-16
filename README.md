# Stress Away

面向大城市高压青年的 AI 智能体 —— 根据你的个人状态，生成定制化的职场反PUA建议及减压行动指南。

## 功能

- **AI 反PUA建议**：描述职场困境，AI 生成定制化建议
- **聊天历史持久化**：对话记录保存在浏览器本地，刷新页面后保留
- **模型配置**：通过环境变量选择 DeepSeek V4 Flash / MiniMax 2.7

## 开始使用

### 1. 安装依赖

```bash
pnpm install
```

### 2. 配置 API Key

```bash
cp .env.local.example .env.local
```

编辑 `.env.local`，填入你的 API Key：

```env
DEFAULT_MODEL=deepseek
DEEPSEEK_API_KEY=your_deepseek_api_key_here
MINIMAX_API_KEY=your_minimax_api_key_here
```

设置 `DEFAULT_MODEL` 为 `deepseek` 或 `minimax` 来选择大模型。

### 3. 启动开发服务器

```bash
pnpm dev
```

打开 http://localhost:3000 开始使用。

## 技术栈

- Next.js 16 + React 19
- TypeScript
- Tailwind CSS 4
- DeepSeek / MiniMax API