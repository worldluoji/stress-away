# 反PUA手册 Spec

## 概念与愿景

反PUA手册 是高压青年的职场反PUA助手。当用户在职场中遭遇困境——被领导否定、被同事抢功、被PUA话术困扰——反PUA手册 能够即时分析情况，生成包含话术反击、心态调整和行动建议的完整方案。

## 技术栈

- **框架**: Next.js 16 (App Router)
- **语言**: TypeScript
- **样式**: Tailwind CSS 4
- **AI**: DeepSeek V4 Flash / MiniMax 2.7
- **存储**: Upstash Redis（生产）/ LocalStorage（测试）
- **支付**: 面包多

## 功能

### MVP
- [x] 聊天界面：用户输入职场困境 → AI 输出反PUA建议
- [x] 聊天历史持久化：LocalStorage 保存对话记录，刷新后保留
- [x] 模型配置：通过 DEFAULT_MODEL 环境变量选择模型
- [x] API Key 配置：通过 .env.local 管理

### 订阅与激活
- [x] 免费额度：每天 1 次对话
- [x] 激活码订阅：50 次对话额度，支持 2 台设备
- [x] 面包多对接：支付回调生成激活码
- [x] 设备激活：基于 FingerprintJS 的设备标识
- [x] 使用追踪：免费用户每日限制，付费用户按次扣费

### 激活码规则

**激活码结构：**
- 每个面包多订单生成 2 个激活码（12 位字母数字）
- 每个激活码可绑定 1 台设备

**设备挤占逻辑：**
1. 设备 A 使用激活码 CODE1 激活 → 设备 A 获得 50 次额度
2. 设备 B 使用同一个激活码 CODE1 激活 → 设备 A 的订阅被撤销，设备 B 获得 CODE1 的剩余次数
3. 每个激活码只能有一台设备处于激活状态

**同一设备重复激活：**
- 同一设备重复使用同一个激活码：保持原有有效期，额度不变

**设备已激活检查：**
- 设备已激活时，无法再激活其他订单（返回 `device_already_activated` 错误）
- 需要先在其他设备上被挤占，腾出设备名额

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
- 返回 HTTP 429 状态码
- 响应头包含 `X-RateLimit-Remaining`、`X-RateLimit-Reset`、`Retry-After`
- 触发限流时返回：
```json
{
  "error": "rate_limit_exceeded",
  "message": "请求过于频繁，请稍后再试",
  "resetAt": 1234567890
}
```

### 激活码防暴力破解

**机制：**
- 连续 5 次激活失败后，该 IP+设备组合被封禁 15 分钟
- 每次激活失败返回 `remainingAttempts` 提示剩余次数
- 激活成功后自动重置失败计数
- 封禁期间返回 HTTP 429：
```json
{
  "error": "activation_blocked",
  "message": "激活尝试次数过多，请15分钟后再试",
  "remainingSeconds": 900
}
```

### 激活码查询保护

**48小时窗口限制：**
- 购买后48小时内可查询激活码
- 超过48小时无法查询，返回 HTTP 403
- 回调触发时记录订单创建时间
- 查询时检查是否在有效窗口内

**超时响应：**
```json
{
  "error": "query_expired",
  "message": "激活码查询窗口已过期（购买后48小时内可查询）"
}
```

**前端提示：**
- 查询结果显示"购买后48小时内可查询激活码，超时后将无法获取，请尽快绑定设备"

## 文件结构

```
├── app/
│   ├── api/
│   │   ├── chat/route.ts           # AI 对话 API
│   │   ├── usage/route.ts          # 查询使用额度
│   │   ├── usage/consume/route.ts  # 消耗使用额度
│   │   └── subscription/
│   │       ├── callback/route.ts    # 面包多支付回调
│   │       ├── query-codes/route.ts # 查询激活码
│   │       └── mbaodu/activate/route.ts # 激活设备
│   ├── components/
│   │   └── SubscriptionActivate.tsx # 激活码激活组件
│   ├── page.tsx                    # 主页聊天界面
│   └── layout.tsx                  # 根布局
├── lib/
│   ├── models.ts                   # 模型配置及调用接口
│   ├── storage.ts                  # LocalStorage 持久化
│   ├── redis.ts                    # 存储层（Redis/LocalStorage）
│   ├── mbaodu.ts                   # 面包多 API
│   ├── subscription.ts             # 订阅逻辑
│   ├── ratelimit.ts                # 限流工具
│   ├── ratelimit-helper.ts        # 限流辅助函数
│   └── activation-security.ts     # 激活码防暴力破解
├── .env.local.example              # 环境变量模板
└── package.json
```

## API

### GET /api/usage

查询当前设备的使用额度。

Headers:
- `x-device-id`: 设备标识

响应：
```json
{
  "allowed": true,
  "remaining": 1,
  "isPaid": false,
  "total": 1
}
```

### POST /api/usage/consume

消耗一次使用额度。

Headers:
- `x-device-id`: 设备标识

响应：
```json
{
  "remaining": 2,
  "isPaid": false
}
```

### POST /api/subscription/query-codes

根据订单号查询激活码。

请求：
```json
{
  "order_id": "MB123456"
}
```

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

Headers:
- `x-device-id`: 设备标识

请求：
```json
{
  "order_id": "MB123456",
  "activation_code": "ABCD1234EFGH"
}
```

响应：
```json
{
  "success": true,
  "remaining_codes": 1
}
```

### POST /api/subscription/callback

面包多支付回调（由面包多服务器调用）。

请求：
```json
{
  "order_id": "MB123456",
  "state": 1
}
```

## 环境变量

| 变量名 | 必需 | 默认值 | 说明 |
|--------|------|--------|------|
| DEFAULT_MODEL | 是 | deepseek | 模型提供商 |
| DEEPSEEK_API_KEY | 是 | - | DeepSeek API Key |
| MINIMAX_API_KEY | 是 | - | MiniMax API Key |
| MBAODU_APP_KEY | 是 | - | 面包多 API Key |
| UPSTASH_REDIS_REST_URL | 生产 | - | Upstash Redis URL |
| UPSTASH_REDIS_REST_TOKEN | 生产 | - | Upstash Redis Token |
| USE_LOCAL_STORAGE | 测试 | true | 使用 LocalStorage |
| FREE_LIMIT_PER_DAY | 否 | 1 | 免费每日次数 |
| PAID_LIMIT | 否 | 50 | 付费总次数 |