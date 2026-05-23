# 反PUA手册 Spec

## 概念与愿景

反PUA手册 是高压青年的职场反PUA助手。当用户在职场中遭遇困境——被领导否定、被同事抢功、被PUA话术困扰——反PUA手册 能够即时分析情况，生成包含话术反击、心态调整和行动建议的完整方案。

## 技术栈

- **框架**: Next.js 16 (App Router)
- **语言**: TypeScript + React 19
- **样式**: Tailwind CSS 4
- **AI**: DeepSeek V4 Flash / MiniMax 2.7
- **存储**: Upstash Redis（生产）/ LocalStorage（测试）
- **支付**: 面包多

## 功能

### 核心功能
- [x] 聊天界面：用户输入职场困境 → AI 输出反PUA建议
- [x] 场景模板：内置常见职场困境模板（话术、心态、证据、法律参考）
- [x] 历史记录：本地存储最多50条对话，可切换/删除
- [x] 输入限制：用户输入最多600字，前端+后端双重校验
- [x] 模型配置：通过 DEFAULT_MODEL 环境变量选择模型

### 订阅与激活
- [x] 免费额度：每天 1 次对话
- [x] 激活码订阅：50 次对话额度，2 个激活码
- [x] 面包多对接：支付回调生成激活码
- [x] 设备激活：基于 FingerprintJS 的设备标识
- [x] 使用追踪：免费用户每日限制，付费用户按次扣费
- [x] 管理后台：查询/重新生成激活码

### 激活码规则

**激活码结构：**
- 每个面包多订单生成 2 个激活码
- 格式：`XXXX-XXXX-XXXX-XX`（带 Mod 97 校验位）

**设备挤占逻辑：**
1. 设备 A 使用 CODE1 激活 → 设备 A 获得 50 次额度
2. 设备 B 使用 CODE1 激活 → 设备 A 被撤销，设备 B 获得 CODE1 剩余次数
3. 每个激活码只能有一台设备处于激活状态

**同一设备重复激活：**
- 保持原有有效期，额度不变

**设备已激活检查：**
- 设备已激活时，无法再激活其他订单

### 限流规则

**维度：** 设备 ID + IP 地址双重限制

**限制配置：**
| API | 限制 |
|-----|------|
| /api/chat | 20 次/分钟 |
| /api/subscription/activate | 10 次/分钟 |
| /api/subscription/query-codes | 10 次/分钟 |
| /api/usage | 30 次/分钟 |
| /api/subscription/callback | 5 次/分钟 |

**限流响应：**
- HTTP 429 状态码
- 响应头：`X-RateLimit-Remaining`、`X-RateLimit-Reset`、`Retry-After`

### 激活码防暴力破解

- 连续 5 次失败，封禁 15 分钟
- 激活成功后自动重置失败计数
- 返回 `remainingAttempts` 提示剩余次数

### 48小时查询窗口

- 购买后48小时内可查询激活码
- 超过48小时无法查询，返回 HTTP 403

### 输入限制

- 用户输入框限制 600 字
- 后端 `/api/chat` 验证用户消息不超过 600 字
- 场景前缀不计入用户输入字数

## 文件结构

```
├── app/
│   ├── admin/page.tsx                 # 管理后台
│   ├── api/
│   │   ├── admin/
│   │   │   ├── login/route.ts        # 管理登录
│   │   │   └── orders/[orderId]/route.ts # 订单激活码管理
│   │   ├── chat/route.ts              # AI 对话
│   │   ├── docs/route.ts              # API 文档
│   │   ├── scenarios/                # 场景模板 API
│   │   ├── subscription/
│   │   │   ├── callback/             # 面包多回调
│   │   │   ├── mbaodu/activate/      # 激活设备
│   │   │   └── query-codes/          # 查询激活码
│   │   └── usage/                    # 额度管理
│   ├── components/
│   │   ├── HistoryPanel.tsx           # 历史记录面板
│   │   ├── ScenarioCard.tsx          # 场景卡片
│   │   ├── ScenarioModal.tsx          # 场景详情弹窗
│   │   └── SubscriptionActivate.tsx  # 激活组件
│   ├── docs/page.tsx                 # API 文档页
│   └── page.tsx                      # 主页
├── lib/
│   ├── activation-security.ts         # 激活码防暴力破解
│   ├── mbaodu.ts                     # 面包多 API
│   ├── models.ts                     # 模型配置
│   ├── ratelimit.ts                  # 限流
│   ├── redis.ts                       # 存储层
│   ├── scenarios.ts                   # 场景数据
│   ├── storage.ts                    # LocalStorage
│   └── subscription.ts               # 订阅逻辑
├── .env.local.example
└── package.json
```

## API

### GET /api/usage

查询当前设备的使用额度。

Headers: `x-device-id`

响应：
```json
{ "allowed": true, "remaining": 1, "isPaid": false, "total": 1 }
```

### POST /api/usage/consume

消耗一次使用额度。

Headers: `x-device-id`

响应：
```json
{ "remaining": 2, "isPaid": false }
```

### POST /api/subscription/query-codes

查询激活码。

请求：`{ "order_id": "MB123456" }`

响应：
```json
{
  "success": true,
  "codes": [
    { "code": "AB****YZ", "used": false },
    { "code": "CD****WX", "used": false }
  ]
}
```

### POST /api/subscription/mbaodu/activate

激活设备。

Headers: `x-device-id`

请求：
```json
{ "order_id": "MB123456", "activation_code": "ABCD-1234-EFGH-56" }
```

响应：
```json
{ "success": true, "remaining_codes": 1 }
```

### POST /api/subscription/callback

面包多支付回调（面包多服务器调用）。

请求：`{ "order_id": "MB123456", "state": 1 }`

### POST /api/admin/login

管理后台登录。

请求：`{ "password": "xxx" }`

响应：设置 httpOnly cookie，成功返回 `{ "success": true }`

### GET /api/admin/orders/{orderId}

查询订单激活码（需登录）。

响应：
```json
{
  "orderId": "MB123456",
  "codes": [
    { "code": "ABCD-1234-EFGH-56", "used": false }
  ]
}
```

### POST /api/admin/orders/{orderId}

重新生成激活码（覆盖旧码）。

响应：
```json
{
  "orderId": "MB123456",
  "success": true,
  "codes": [
    { "code": "NEW1-ABCD-EFGH-12", "used": false },
    { "code": "NEW2-IJKL-MNOP-34", "used": false }
  ]
}
```

## 环境变量

| 变量名 | 必需 | 默认值 | 说明 |
|--------|------|--------|------|
| DEFAULT_MODEL | 是 | deepseek | 模型 |
| DEEPSEEK_API_KEY | 是 | - | DeepSeek Key |
| MINIMAX_API_KEY | 是 | - | MiniMax Key |
| MBAODU_APP_KEY | 是 | - | 面包多 Key |
| ADMIN_PASSWORD | 是 | - | 管理后台密码 |
| UPSTASH_REDIS_REST_URL | 生产 | - | Redis URL |
| UPSTASH_REDIS_REST_TOKEN | 生产 | - | Redis Token |
| USE_LOCAL_STORAGE | 测试 | true | 使用 LocalStorage |
| FREE_LIMIT_PER_DAY | 否 | 1 | 免费每日次数 |
| PAID_LIMIT | 否 | 50 | 付费总次数 |