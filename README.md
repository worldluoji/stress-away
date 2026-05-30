# 反PUA手册

面向大城市高压青年的 AI 智能体 —— 根据你的个人状态，生成定制化的职场反PUA建议及减压行动指南。

## 功能

### 核心功能
- **AI 反PUA建议**：描述职场困境，AI 生成定制化建议（话术反击、心态调整、行动建议）
- **场景模板**：内置 12 个常见职场困境模板，覆盖话术、心态、法律参考
- **聊天历史**：对话记录本地存储，刷新后保留
- **历史记录**：保存最多50条历史对话，可切换/删除/继续追问

### 订阅与激活
- **双渠道激活**：支持面包多订单激活和管理端激活码激活
- **管理端激活码**：管理员可生成独立激活码，支持闲鱼等平台销售
- **激活码继承次数**：激活码本身记录剩余次数，换设备激活时自动继承
- **免费试用**：每天 1 次免费对话额度
- **激活码订阅**：购买后获得 50 次对话额度，支持 2 个激活码
- **48小时查询窗口**：购买后48小时内可查询激活码
- **管理后台**：管理员可生成/查询激活码，查询/重新生成订单激活码（`/admin`）

### 安全保护
- **限流**：设备 ID + IP 双重限制，防止恶意攻击
- **激活码防暴力破解**：连续失败5次封禁15分钟
- **输入限制**：用户输入最多600字，前端+后端双重校验
- **管理端设备绑定**：可通过 `ADMIN_ALLOWED_DEVICES` 配置只允许特定设备登录

### 模型配置
- 支持 DeepSeek V4 Flash / MiniMax 2.7
- 通过环境变量选择

## 技术栈

- **框架**: Next.js 16 + React 19
- **语言**: TypeScript
- **样式**: Tailwind CSS 4
- **AI**: DeepSeek / MiniMax API
- **存储**: Upstash Redis（生产）/ LocalStorage（测试）
- **支付**: 面包多

## 快速开始

### 1. 安装依赖

```bash
pnpm install
```

### 2. 配置环境变量

```bash
cp .env.local.example .env.local
```

编辑 `.env.local`：

```env
# AI 模型
DEFAULT_MODEL=deepseek
DEEPSEEK_API_KEY=your_deepseek_api_key
MINIMAX_API_KEY=your_minimax_api_key

# 面包多（激活码）
MBAODU_APP_KEY=your_mbaodu_key

# 管理后台密码
ADMIN_PASSWORD=your_admin_password

# Redis（生产环境）
UPSTASH_REDIS_REST_URL=your_redis_url
UPSTASH_REDIS_REST_TOKEN=your_redis_token

# 开发模式
USE_LOCAL_STORAGE=true
FREE_LIMIT_PER_DAY=1
PAID_LIMIT=50
```

### 3. 启动

```bash
pnpm dev
```

访问 http://localhost:3000

## 管理后台

访问 `/admin` 输入管理密码后可：
- 生成管理端激活码（支持闲鱼等平台销售）
- 查询指定订单号的当前激活码
- 重新生成激活码（覆盖旧码）

## 文件结构

```
├── app/
│   ├── admin/page.tsx                 # 管理后台页面
│   ├── api/
│   │   ├── admin/
│   │   │   ├── codes/route.ts        # 管理端激活码生成/查询
│   │   │   ├── login/route.ts         # 管理登录
│   │   │   └── orders/[orderId]/route.ts # 订单激活码管理
│   │   ├── chat/route.ts              # AI 对话
│   │   ├── scenarios/                 # 场景模板
│   │   ├── subscription/              # 订阅与激活
│   │   │   ├── admin/activate/       # 管理端激活码激活
│   │   │   ├── callback/              # 面包多回调
│   │   │   ├── mbaodu/activate/       # 激活设备
│   │   │   └── query-codes/           # 查询激活码
│   │   └── usage/                     # 额度管理
│   ├── components/
│   │   ├── HistoryPanel.tsx           # 历史记录面板
│   │   ├── ScenarioCard.tsx           # 场景卡片
│   │   ├── ScenarioModal.tsx          # 场景详情弹窗
│   │   └── SubscriptionActivate.tsx   # 激活组件
│   └── page.tsx                       # 主页
├── lib/
│   ├── activation-security.ts         # 激活码防暴力破解
│   ├── mbaodu.ts                      # 面包多 API
│   ├── models.ts                      # 模型配置
│   ├── ratelimit.ts                   # 限流
│   ├── redis.ts                       # 存储层
│   ├── scenarios.ts                   # 场景数据
│   ├── storage.ts                     # LocalStorage
│   └── subscription.ts                 # 订阅逻辑
└── spec.md                            # 详细规格文档
```

## 环境变量

| 变量名 | 必需 | 默认值 | 说明 |
|--------|------|--------|------|
| DEFAULT_MODEL | 是 | deepseek | 模型 |
| DEEPSEEK_API_KEY | 是 | - | DeepSeek Key |
| MINIMAX_API_KEY | 是 | - | MiniMax Key |
| MBAODU_APP_KEY | 是 | - | 面包多 Key |
| ADMIN_PASSWORD | 是 | - | 管理后台密码 |
| ADMIN_ALLOWED_DEVICES | 否 | - | 允许的管理端设备指纹，多个用逗号分隔 |
| UPSTASH_REDIS_REST_URL | 生产 | - | Redis URL |
| UPSTASH_REDIS_REST_TOKEN | 生产 | - | Redis Token |
| USE_LOCAL_STORAGE | 测试 | true | 使用 LocalStorage |
| FREE_LIMIT_PER_DAY | 否 | 1 | 免费每日次数 |
| PAID_LIMIT | 否 | 50 | 付费总次数 |