# Stress Away Spec

## 概念与愿景

stress-away 是高压青年的职场反PUA助手。当用户在职场中遭遇困境——被领导否定、被同事抢功、被PUA话术困扰——stress-away 能够即时分析情况，生成包含话术反击、心态调整和行动建议的完整方案。

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
│   └── subscription.ts            # 订阅逻辑
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
  "remaining": 3,
  "isPaid": false,
  "total": 3
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