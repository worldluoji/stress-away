# Stress Away

面向大城市高压青年的 AI 智能体 —— 根据你的个人状态，生成定制化的职场反PUA建议及减压行动指南。

## 功能

- **AI 反PUA建议**：描述职场困境，AI 生成定制化建议
- **聊天历史持久化**：对话记录保存在浏览器本地，刷新页面后保留
- **免费试用**：每天 1 次免费对话额度
- **激活码订阅**：购买后获得 50 次对话额度，支持 2 台设备
- **模型配置**：通过环境变量选择 DeepSeek V4 Flash / MiniMax 2.7

## 开始使用

### 1. 安装依赖

```bash
pnpm install
```

### 2. 配置环境变量

```bash
cp .env.local.example .env.local
```

编辑 `.env.local`，填入你的配置：

```env
# AI 模型配置
DEFAULT_MODEL=deepseek
DEEPSEEK_API_KEY=your_deepseek_api_key_here
MINIMAX_API_KEY=your_minimax_api_key_here

# 面包多（激活码系统）
MBAODU_APP_KEY=your_mbaodu_app_key_here

# Upstash Redis（生产环境使用）
UPSTASH_REDIS_REST_URL=your_redis_url
UPSTASH_REDIS_REST_TOKEN=your_redis_token

# 本地开发模式（设为 true 使用 LocalStorage，设为 false 使用 Redis）
USE_LOCAL_STORAGE=true

# 使用限制配置
FREE_LIMIT_PER_DAY=3
PAID_LIMIT=50
```

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
- Upstash Redis（生产环境）
- 面包多（支付与激活码）