# 反PUA手册 Spec

## 概念与愿景

反PUA手册 是高压青年的职场维权与应对助手。核心付费能力：当用户遭遇裁员/欠薪/违法解除时，免费估算法定赔偿（N+1/2N/代通知金/加班费/年假折算），付费生成完整维权方案报告（赔偿明细核对、证据清单、仲裁流程时间线、仲裁申请书草稿、谈判策略）。辅以免费的职场反PUA应对话术作为获客漏斗。

**变现逻辑**：情绪宣泄不付费，"帮用户拿回钱"付费——预期回款数千至数万元 vs 单份报告 ¥9.9–29.9。

## 技术栈

- **框架**: Next.js 16 (App Router)
- **语言**: TypeScript + React 19
- **样式**: Tailwind CSS 4
- **AI**: DeepSeek V4 Flash / MiniMax 2.7
- **存储**: MySQL 8.0（订阅/对话/事件/kv_store）+ 进程内内存（限流/防爆破/订阅读缓存）+ LocalStorage（客户端缓存）
- **支付**: 面包多
- **测试**: Vitest（表格驱动单元测试，`pnpm test`）
- **部署**: Docker (multi-stage, Next.js standalone, node:22-alpine)

## 功能

### 劳动维权（核心，`/labor`）
- [x] 赔偿金计算器：免费无门槛，纯客户端实时估算；规则依据《劳动合同法》第40/47/87条——取整（≥6个月按1年、<6个月半月）、高薪双封顶（基数3×社平、年限≤12）、2N替代N、代通知金按上月工资（仅第40条未提前30日书面通知）、加班费150%/200%/300%（时薪=月薪÷21.75÷8）、未休年假补发200%；`lib/compensation.ts` 纯函数 + 表格驱动测试
- [x] 社平工资封顶表：`lib/social-wage.ts` 内置15个高频城市，`SOCIAL_WAGE_DATA_AS_OF` 时效标注；未收录城市不封顶并在 warnings 提示自行核实；年度人工更新，不做自动 pipeline
- [x] 维权方案报告：付费功能（仅 `isPaid` 用户，否则 403 `paid_only`），消耗 1 次报告额度；金额由服务端 `computeCompensation` 重算后注入 prompt，防篡改；AI 五段式输出；`labor-report` 计入 scenario_stats 统计
- [x] 免责声明：计算器旁 / 报告页脚（route 层固定拼接）/ 首页页脚三处，标注"AI生成、不构成律师意见、以仲裁认定为准"

### 核心功能
- [x] 聊天界面：用户输入职场困境 → AI 输出反PUA建议（结构化四段式输出：话术反击、心态调整、行动建议、法律参考）
- [x] 场景模板：内置 12 个常见职场困境模板，支持场景细分问答生成专属话术
- [x] 场景细分：选择场景后可回答 2-3 个跟进问题（场合、严重程度、具体情况），AI 生成更贴合的话术
- [x] 历史记录：MySQL 持久化存储最多50条对话，可切换/删除/继续追问
- [x] 输入限制：用户输入最多600字，前端+后端双重校验
- [x] 模型配置：通过 DEFAULT_MODEL 环境变量选择模型

### 订阅与激活
- [x] 免费对话：登录用户每天 10 次免费对话（按 uid 计数，不消耗购买次数）；超出后付费用户确认消耗 1 次购买额度可继续对话（402 → `confirmPaid` 重发），未付费用户 403 引导激活
- [x] 激活码订阅：购买次数优先用于生成维权报告（默认每码 50 次），2 个激活码
- [x] 管理端激活码：管理员生成独立激活码，支持闲鱼等平台销售
- [x] 面包多对接：支付回调生成激活码
- [x] 设备激活：基于 FingerprintJS 的设备标识
- [x] 使用追踪：对话优先消耗每日免费额度，报告生成与超额对话扣购买次数
- [x] 管理后台：生成/查询管理端激活码，查询/重新生成订单激活码

### 激活码规则

**激活码结构：**
- 每个管理端激活码从生成时刻起有效期 30 天，含固定次数（默认 50，可定制）
- 格式：`XXXX-XXXX-XXXX-XX`（带 Mod 97 校验位）
- 旧的"每订单 2 个码"语义已被清理（见 migration 004），仅保留管理端单码

**多码叠加规则（管理端激活码，TCB 账号模式）：**
- 一个 TCB 账号可绑定**多个**管理端激活码，叠加规则：
  - **额度叠加**：`remaining_usage += new_code.total_times`，`total_usage += new_code.total_times`
  - **时间叠加**：`expires_at = max(current_expires_at, new_code_expires_at)`（取所有绑定码中最晚到期时间）
  - **同码重复绑定**：幂等返回当前订阅状态，不重复扣减
  - **订阅过期后绑新码**：不继承过期前剩余次数（已失效），以新码 `total_times` 起步
- **设备 ID**：首次绑定的 `device_id` 在该 uid 后续叠加中保留（`COALESCE`），避免设备混乱
- **单码单用户约束保留**：码一旦绑定给某 uid，其他 uid 尝试绑定同一码返回 `code_already_used`

**过期语义：**
- 当 `now > subscriptions.expires_at` 时，订阅视为失效
- `isPaidUserByUid` / `consumeUsageByUid` 会拒绝该订阅，剩余次数不可用
- 用户必须绑定新码才能恢复（绑定时不携带过期前剩余次数）

**数据层映射：**
- `subscriptions.activation_code` = 最近一次绑定的码（叠加模式下不代表唯一）
- `subscriptions.expires_at` = 所有绑定码 `expires_at` 的最大值

### 限流规则

**维度：** 设备 ID + IP 地址双重限制

**限制配置：**
| API | 限制 |
|-----|------|
| /api/chat | 20 次/分钟 |
| /api/report | 5 次/分钟 |
| /api/subscription/activate | 10 次/分钟 |
| /api/subscription/query-codes | 10 次/分钟 |
| /api/usage | 30 次/分钟 |
| /api/subscription/callback | 5 次/分钟 |

**限流响应：**
- HTTP 429 状态码
- 响应头：`X-RateLimit-Remaining`、`X-RateLimit-Reset`、`Retry-After`

### 数据层架构

**MySQL 8.0（持久化）**
- `subscriptions`：订阅状态（uid 主键）、设备绑定、剩余次数
- `admin_activation_codes`：管理端激活码及绑定记录
- `conversations`：对话历史（JSON 存储，最多50条）
- `messages` / `message_reactions` / `saved_messages`：消息索引、点赞、收藏
- `usage_events`：使用事件（场景浏览/聊天/复制）
- `scenario_stats`：场景统计数据（视图数/聊天数/复制数）
- `kv_store`：短期持久状态 KV（每日免费对话计数、管理端 Token、deviceId 防伪，key + value + expires_at）

**高频/短期状态（内存 + MySQL kv_store 混合）**
- 限流计数 / 登录与激活码防爆破计数：进程内 TtlMap（秒~分钟级 TTL，重启丢失可接受）
- 对话每日免费计数（按 uid）：kv_store `kvIncr` 原子自增（跨天 TTL，必须持久，防止重启清零被薅）
- 管理端 Token：kv_store（2小时 TTL，存 SHA-256 哈希）
- deviceId 防伪记录：kv_store（1小时 TTL）
- 订阅状态读缓存：进程内内存（60秒 TTL，MySQL 为 source of truth）
- MySQL 不可用时 kv 自动降级为进程内内存（本地开发零依赖可运行）

**缓存策略（subscriptions）**
- 读：内存缓存优先 → 未命中则查 MySQL → 回填内存
- 写：先写 MySQL → 再更新/失效内存缓存
- 如果 MySQL 不可用，写入静默跳过（fail-closed，不阻塞服务）

**LocalStorage（客户端）**
- 前端对话缓存（临时，不影响 MySQL 持久化）

### 管理端设备绑定

- 环境变量 `ADMIN_ALLOWED_DEVICES` 配置允许的设备指纹
- 多个设备用逗号分隔
- 登录时验证：密码正确 **且** 设备指纹在白名单中
- 如未配置 `ADMIN_ALLOWED_DEVICES`，则不进行设备验证

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

### 部署架构

- **镜像基座**：`node:22-alpine`，多阶段构建（deps → builder → runner）
- **构建模式**：`output: 'standalone'`，生成最小化 `node_modules`
- **运行时**：非 root 用户 `nextjs`（uid=1001），`NODE_ENV=production`
- **端口**：容器内 3000（`HOSTNAME=0.0.0.0`），健康检查 `/` 路径
- **环境变量**：
  - 构建时变量（`NEXT_PUBLIC_*`）：在 `pnpm build` 阶段从项目根的 `.env.production` 读取并内联到客户端 JS bundle
  - 运行时变量（API keys、数据库密码等）：通过 `docker run --env-file .env.production` 注入；服务端代码 `process.env` 在请求时读取
  - **镜像安全**：Next.js 16 standalone 模式会自动将 `.env.production` 复制到 `.next/standalone/`，Dockerfile 在 runner 阶段显式 `rm` 掉它，避免敏感文件残留
- **外部依赖**（不打包进镜像）：MySQL 8.0、Tencent CloudBase (TCB)

## 文件结构

```
├── app/
│   ├── admin/page.tsx                 # 管理后台
│   ├── api/
│   │   ├── admin/
│   │   │   ├── codes/route.ts        # 管理端激活码生成/查询
│   │   │   ├── login/route.ts        # 管理登录
│   │   │   └── orders/[orderId]/route.ts # 订单激活码管理
│   │   ├── chat/route.ts              # AI 对话
│   │   ├── docs/route.ts              # API 文档
│   │   ├── report/route.ts            # 维权方案报告（付费，服务端重算）
│   │   ├── scenarios/                # 场景模板 API
│   │   ├── subscription/
│   │   │   ├── admin/activate/       # 管理端激活码激活
│   │   │   ├── callback/             # 面包多回调
│   │   │   ├── mbaodu/activate/      # 激活设备
│   │   │   └── query-codes/          # 查询激活码
│   │   └── usage/                    # 额度查询（GET）
│   ├── components/
│   │   ├── CompensationForm.tsx       # 赔偿金计算器表单
│   │   ├── HistoryPanel.tsx           # 历史记录面板
│   │   ├── ReportPanel.tsx            # 维权报告生成面板
│   │   ├── ScenarioCard.tsx          # 场景卡片
│   │   ├── ScenarioModal.tsx          # 场景详情弹窗
│   │   └── SubscriptionActivate.tsx  # 激活组件
│   ├── docs/page.tsx                 # API 文档页
│   ├── labor/page.tsx                # 劳动维权主页
│   └── page.tsx                      # 主页
├── lib/
│   ├── activation-security.ts         # 激活码防暴力破解
│   ├── compensation.ts               # 赔偿金计算纯函数（第40/47/87条）
│   ├── social-wage.ts                # 城市社平工资封顶表
│   ├── db.ts                         # MySQL 连接池
│   ├── conversations.ts             # 对话历史 MySQL 持久化
│   ├── subscriptions.ts             # 订阅/激活码 MySQL + 内存缓存
│   ├── usage-events.ts              # 使用事件追踪 + 场景统计
│   ├── mbaodu.ts                    # 面包多 API
│   ├── models.ts                    # 模型配置
│   ├── ratelimit.ts                 # 限流 + deviceId 防伪
│   ├── ttl-map.ts                   # 进程内 TTL 存储（限流/防爆破/订阅读缓存）
│   ├── kv.ts                        # MySQL kv_store（无 MySQL 时自动降级内存）
│   ├── chat-quota.ts               # 对话额度决策纯函数（CHAT_FREE_PER_DAY）
│   ├── free-count.ts                # 每日免费对话次数（kv_store 持久化，按 uid）
│   ├── admin-security.ts            # 管理端 Token + 登录防爆破
│   ├── scenarios.ts                # 场景数据
│   ├── storage.ts                  # LocalStorage（客户端缓存）
│   └── subscription.ts             # 订阅逻辑（入口）
├── sql/
│   └── migrations/
│       └── 001_initial.sql         # MySQL 全量最终态建表语句
├── test/
│   ├── chat-quota.test.ts           # 对话额度决策表格驱动测试
│   ├── compensation.test.ts         # 赔偿金计算表格驱动测试
│   └── report-prompt.test.ts        # 报告 prompt 断言测试
├── .env.local.example
└── package.json
```

## API

### GET /api/usage

查询当前用户的额度状态（购买次数 = 报告货币；对话另有每日免费额度）。

Headers: `x-device-id`、`x-user-id`

响应：
```json
{ "allowed": true, "remaining": 5, "isPaid": true, "total": 100, "chatFreeRemaining": 8, "chatFreeTotal": 10 }
```

### POST /api/chat

AI 对话。登录用户每日 10 次免费；免费额度用尽后，付费用户需带 `confirmPaid: true` 重发以消耗 1 次购买额度。

Headers: `x-device-id`、`X-User-Id`

请求：
```json
{ "messages": [{ "role": "user", "content": "…" }], "scenarioId": "general", "confirmPaid": false }
```

响应（200，AI 成功后才结算额度）：
```json
{ "reply": "…", "quota": { "allowed": true, "remaining": 5, "isPaid": true, "total": 100, "chatFreeRemaining": 0, "chatFreeTotal": 10 } }
```

错误：402 `chat_quota_confirm`（免费额度用尽且未确认，附 `message`/`freeUsed`/`paidRemaining`，前端确认后带 `confirmPaid: true` 重发）、403 `login_required`（未登录）、403 `free_exhausted`（未付费超每日免费额度）、403 `no_quota`（购买次数耗尽）、400 输入非法、429 限流、500 AI 失败（不结算额度）。

### POST /api/report

生成劳动维权方案报告。仅付费用户；服务端重算赔偿金额后注入 prompt。

Headers: `x-device-id`、`X-User-Id`

请求：
```json
{
  "comp": {
    "monthlyAvgWage": 20000,
    "hiredAt": "2020-01-01",
    "firedAt": "2023-01-01",
    "city": "北京",
    "dismissalType": "illegal",
    "noAdvanceNotice": true,
    "overtimeHours": { "weekday": 10, "weekend": 8, "holiday": 4 },
    "unusedAnnualLeaveDays": 5
  },
  "intakeAnswers": { "目前的情况": "公司通知裁员" },
  "narrative": "公司以架构调整为由口头通知离职…"
}
```

`dismissalType` 枚举：`mutual | no-fault-40 | illegal | expired | forced-resign`。

响应：
```json
{
  "reply": "## 一、赔偿明细核对 …（五段式报告，页脚含免责声明）",
  "computation": { "severanceN": 120000, "total": 128500, "lines": [], "warnings": [] }
}
```

错误：403 `login_required`（未登录）、403 `paid_only`（非付费用户）、403 `no_quota`（次数用完）、400 `invalid_input`、429 限流、500 AI 失败（不扣额度）。

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

请求：`{ "password": "xxx", "deviceId": "fp_xxx" }`（deviceId 可选）

响应：设置 httpOnly cookie，成功返回 `{ "success": true }`

**设备验证**：如果配置了 `ADMIN_ALLOWED_DEVICES`，则必须提供 deviceId 且必须在白名单中。

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

### POST /api/admin/codes

生成管理端激活码（需登录）。

请求：`{ "times": 50 }`（可选，默认50）

响应：
```json
{
  "code": "ABCD-1234-EFGH-56",
  "expiresAt": 1751395200000,
  "totalTimes": 50
}
```

### GET /api/admin/codes

查询管理端激活码列表（需登录）。

查询参数：`?page=1&limit=20` 或 `?code=ABCD-1234-EFGH-56`

响应（列表）：
```json
{
  "codes": [...],
  "total": 100,
  "page": 1
}
```

响应（单个）：
```json
{
  "code": "ABCD-1234-EFGH-56",
  "createdAt": 1751212800000,
  "expiresAt": 1751395200000,
  "totalTimes": 50,
  "userSubRemaining": 45,
  "used": true,
  "deviceId": "xxx",
  "activationTime": 1751300000000
}
```

> `userSubRemaining` 是绑定该码的 TCB 账号当前订阅的剩余次数（叠加模式下等于账号下所有码的合并剩余）；`totalTimes` 是码本身的总次数。

### POST /api/subscription/admin/activate

使用管理端激活码激活/叠加到 TCB 账号。

Headers: `x-device-id` + 已登录 TCB 用户

请求：
```json
{ "code": "ABCD-1234-EFGH-56" }
```

响应：
```json
{ "success": true, "remainingCodes": 150, "expiresAt": 1753219200000 }
```

**多码叠加语义：**
- `remainingCodes` 为账号叠加后的总剩余次数（包含已绑定的所有码）
- `expiresAt` 为所有绑定码中最晚的过期时间
- 同码重复绑定：幂等返回当前订阅，不重复扣减
- 订阅过期后绑新码：从新码 `totalTimes` 起步，不继承过期前余额
- 其他 uid 尝试绑同一码：返回 `invalid_code`（含 `code_already_used` 内部错误码）

## 环境变量

| 变量名 | 必需 | 默认值 | 说明 |
|--------|------|--------|------|
| DEFAULT_MODEL | 是 | deepseek | 模型 |
| DEEPSEEK_API_KEY | 是 | - | DeepSeek Key |
| MINIMAX_API_KEY | 是 | - | MiniMax Key |
| MBAODU_APP_KEY | 是 | - | 面包多 Key |
| ADMIN_PASSWORD | 是 | - | 管理后台密码 |
| MYSQL_HOST | 生产 | localhost | MySQL 主机 |
| MYSQL_PORT | 生产 | 3306 | MySQL 端口 |
| MYSQL_USER | 生产 | - | MySQL 用户名 |
| MYSQL_PASSWORD | 生产 | - | MySQL 密码 |
| MYSQL_DATABASE | 生产 | - | MySQL 数据库名 |
| MYSQL_USE_SSL | 否 | false | MySQL SSL 连接 |
| USE_LOCAL_STORAGE | 测试 | true | true=LocalStorage，false=MySQL |
| CHAT_FREE_PER_DAY | 否 | 10 | 每日免费对话次数 |