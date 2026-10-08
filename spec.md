# 反PUA手册 Spec

## 概念与愿景

反PUA手册 是高压青年的职场维权与应对助手。核心付费能力：当用户遭遇裁员/欠薪/违法解除时，免费估算法定赔偿（N+1/2N/代通知金/加班费/年假折算），付费生成完整维权方案报告（赔偿明细核对、证据清单、仲裁流程时间线、仲裁申请书草稿、谈判策略）。辅以免费的职场反PUA应对话术作为获客漏斗。

**变现逻辑**：情绪宣泄不付费，"帮用户拿回钱"付费——预期回款数千至数万元 vs 单份报告 ¥9.9–29.9。

## 技术栈

- **框架**: Next.js 16 (App Router)
- **语言**: TypeScript + React 19
- **样式**: Tailwind CSS 4
- **AI**: DeepSeek V4 Flash / MiniMax 2.7
- **存储**: MySQL 8.0（账号/会话/订阅/对话/事件/kv_store）+ 进程内内存（限流/防爆破/订阅读缓存）+ LocalStorage（客户端缓存）
- **账号体系**: 自建（scrypt 密码哈希 + sessions 表 + httpOnly Cookie），无第三方登录 SDK、无 JWT
- **变现**: 管理端发放制（管理员给用户账号加报告次数，无自助支付/激活码/面包多）
- **测试**: Vitest（表格驱动单元测试，`pnpm test`）
- **部署**: Docker (multi-stage, Next.js standalone, node:22-alpine)

## 功能

### 劳动维权（核心，`/labor`）
- [x] 赔偿金计算器：免费无门槛，纯客户端实时估算；规则依据《劳动合同法》第40/47/87条——取整（≥6个月按1年、<6个月半月）、高薪双封顶（基数3×社平、年限≤12）、2N替代N、代通知金按上月工资（仅第40条未提前30日书面通知）、加班费150%/200%/300%（时薪=月薪÷21.75÷8）、未休年假补发200%；`lib/compensation.ts` 纯函数 + 表格驱动测试
- [x] 社平工资封顶表：`lib/social-wage.ts` 内置 30 个高频城市，每条 `WageRecord { wage, effectiveDate, sourceUrl, sourceLabel, isEstimate }`；`isEstimate` 标记是否经人社局核对（默认 `true`，人工核对后改 `false`）；未收录城市按三级查表链 `城市表 → 省会代理 → 用户自填` 处理（详见 `getSocialWageContext`），省份映射见 `lib/cities.ts`；`SOCIAL_WAGE_DATA_AS_OF` 为全局时效 floor；年度人工更新，不做自动 pipeline
  - 表单交互：城市输入框下方提示「未收录城市会自动回退到所属省份平均值」；并列折叠 details「选填：自定义社平工资」可输入本地数值（>0 才生效）；结果卡末尾按 `breakdown.wageSource.source` 分支展示「city/province/user/uncovered」对应文案，city/province 分支含人社局来源链接
- [x] 维权方案报告：付费功能（仅 `isPaid` 用户，否则 403 `paid_only`），消耗 1 次报告额度；金额由服务端 `computeCompensation` 重算后注入 prompt，防篡改；AI 五段式输出；`labor-report` 计入 scenario_stats 统计
- [x] 免责声明：计算器旁 / 报告页脚（route 层固定拼接）/ 首页页脚三处，标注"AI生成、不构成律师意见、以仲裁认定为准"

### 核心功能
- [x] 聊天界面：用户输入职场困境 → AI 输出反PUA建议（结构化四段式输出：话术反击、心态调整、行动建议、法律参考）
- [x] 场景模板：内置 12 个常见职场困境模板，支持场景细分问答生成专属话术
- [x] 场景细分：选择场景后可回答 2-3 个跟进问题（场合、严重程度、具体情况），AI 生成更贴合的话术
- [x] 历史记录：MySQL 持久化存储最多50条对话，可切换/删除/继续追问
- [x] 输入限制：用户输入最多600字，前端+后端双重校验
- [x] 模型配置：通过 DEFAULT_MODEL 环境变量选择模型

### 账号与登录
- [x] 自建账号体系：用户名+密码，**无自助注册**，账号由管理员在 `/admin`「账号管理」创建并一次性发放初始密码（`xxxx-xxxx-xxxx` 去易混淆字符）；详见「账号与会话」章节
- [x] 管理员账号幂等引导：`ADMIN_USERNAME/ADMIN_PASSWORD` 齐备时首次登录自动建号/升格，登录后走同一套 `/api/auth/login`（按 role 区分入口）

### 订阅与额度发放（管理端发放制）
- [x] 免费对话：登录用户每天 10 次免费对话（按 uid 计数，不消耗购买次数）；超出后付费用户确认消耗 1 次购买额度可继续对话（402 → `confirmPaid` 重发），未付费用户 403 引导「如何购买」
- [x] 购买指引：命中未付费/无额度时弹「如何购买」指引卡（展示管理员微信号，线下收款后由管理员在后台加次数；**无自助激活码输入框**）
- [x] 设备标识：基于 FingerprintJS 的设备 ID（限流/deviceId 防伪维度）
- [x] 使用追踪：对话优先消耗每日免费额度，报告生成与超额对话扣购买次数
- [x] 管理后台：账号管理（建号可写入初始次数 / +N 追加次数 / 列表显示剩余与累计发放 / 重置密码），报告付费漏斗卡片（`GET /api/admin/funnel`）

### 次数发放模型（管理端发放制，替代激活码）

**核心语义：**
- 报告次数（`subscriptions.remaining_usage`）即"报告货币"，由管理员在 `/admin`「账号管理」直接发放，**永久有效、无过期概念**
- 付费判定 = `remaining_usage > 0`（`isPaidUserByUid` 单条件）
- 激活码体系（生成码/兑换码/多码叠加/30 天过期/订单码）已整体退役，`admin_activation_codes` 表删除

**发放（`grantUsageByUid(uid, addTimes)`）：**
- 单条原子 upsert：`INSERT … ON DUPLICATE KEY UPDATE total_usage += addTimes, remaining_usage += addTimes`，回读发放后剩余并失效 60s 读缓存
- `addTimes` 必须为 1–999 的整数（`MIN/MAX_GRANT_TIMES`），越界/非整数/无 MySQL/DB 异常一律 **throw**——发放是资金相关操作，绝不静默成功
- 入口两个：建号时随 `POST { username, times }` 写初始次数；存量账号经 `PATCH { userId, addTimes }` 增量追加（先验 `userExists` 再发放，避免 upsert 给不存在 uid 留孤儿订阅行）

**消耗（`consumeUsageByUid(uid)`）：**
- 事务 `SELECT … FOR UPDATE` → `remaining_usage -= 1`，契约不变：业务失败（无记录/用尽）返 0，真实 DB/事务异常 throw（report `settle_failed` 链路依赖此区分）
- 旧数据脏列（`status`/`expires_at` 等）不再读取——历史行按 `remaining_usage` 照常扣减

### 限流规则

**维度：** 设备 ID + IP 地址双重限制

**限制配置：**
| API | 限制 |
|-----|------|
| /api/chat | 20 次/分钟 |
| /api/report | 5 次/分钟（仅 `confirmPaid: true` 的真实生成计数；402 探测不占额度） |
| /api/events | 30 次/分钟 |
| /api/usage | 30 次/分钟 |

**限流响应：**
- HTTP 429 状态码
- 响应头：`X-RateLimit-Remaining`、`X-RateLimit-Reset`、`Retry-After`

### 数据层架构

**MySQL 8.0（持久化）**
- `users` / `sessions`：自建账号与会话（见「账号与会话」章节；sessions 只存 token 的 SHA-256）
- `subscriptions`：订阅额度（uid 主键、device_id、`total_usage` 累计发放、`remaining_usage` 剩余），次数永久有效
- `conversations`：对话历史（JSON 存储，最多50条）
- `messages` / `message_reactions` / `saved_messages`：消息索引、点赞、收藏
- `usage_events`：使用事件（场景浏览/聊天/复制 + 报告付费漏斗：calculator/login_gate/paywall_view/paywall_block/paywall_confirm/paywall_cancel/report_generate/report_download）。`event_type` 列为 **VARCHAR(32) 而非 ENUM**——ENUM 会把新增事件名静默丢弃导致漏斗数据丢失，事件类型只可增不可减（已删 `activate`/`activate_success`，历史行保留不影响聚合）
- `scenario_stats`：场景统计数据（视图数/聊天数/复制数）
- `kv_store`：短期持久状态 KV（每日免费对话计数、deviceId 防伪，key + value + expires_at）

**高频/短期状态（内存 + MySQL kv_store 混合）**
- 限流计数 / 登录防爆破计数：进程内 TtlMap（秒~分钟级 TTL，重启丢失可接受）
- 对话每日免费计数（按 uid）：kv_store `kvIncr` 原子自增（跨天 TTL，必须持久，防止重启清零被薅）
- deviceId 防伪记录：kv_store（1小时 TTL）
- 订阅状态读缓存：进程内内存（60秒 TTL，MySQL 为 source of truth）
- MySQL 不可用时 kv 自动降级为进程内内存（本地开发零依赖可运行）

**缓存策略（subscriptions）**
- 读：内存缓存优先 → 未命中则查 MySQL → 回填内存
- 写：先写 MySQL → 再更新/失效内存缓存
- 如果 MySQL 不可用，写入静默跳过（fail-closed，不阻塞服务）

**LocalStorage（客户端）**
- 前端对话缓存（临时，不影响 MySQL 持久化）

### 账号与会话（自建，替代 TCB）

**账号（users 表）：**
- `id VARCHAR(64)` 主键 = `crypto.randomUUID()`，即全站业务语义中的 `uid`（subscriptions/labor_reports/conversations 等表的 uid 列直接引用，无需迁移）
- `username VARCHAR(32)` UNIQUE；`password_hash VARCHAR(255)` 格式 `v1:<salt-hex>:<scrypt-hex>`（scrypt keylen 64，salt 16 字节随机）
- `role ENUM('admin','user')`；**无自助注册**，账号只能由管理员经 `/api/admin/users` 创建
- 管理员引导：`ensureAdminUser()` 在登录时幂等执行——`ADMIN_USERNAME/ADMIN_PASSWORD` 齐备且账号不存在则建 admin；已存在但 role 非 admin 则升格

**会话（sessions 表 + Cookie）：**
- token = `randomBytes(32)`，库中只存 SHA-256（`token_hash CHAR(64)` 主键），明文仅存在于 Cookie；有效期 7 天
- Cookie `session`：httpOnly / sameSite=lax / secure 仅生产 / path=/；服务端可即时删行吊销
- `createSession` 时机会式 `DELETE` 过期行，防僵尸堆积
- 登出：**先清 cookie 再删库行**；删库失败仍返回 200 但 `sessionPurged:false` 显式告知（本机已退出，token 最长残留 7 天）
- 管理员重置密码 = 改哈希 + `DELETE FROM sessions WHERE user_id=?`（强制该用户全部设备重新登录）

**身份 chokepoint（`lib/api-auth.ts`）：**
- `getAuthContext(request)` 返回 `{uid, deviceId, role, isLoggedIn}`；**uid/role 唯一来源是验签会话**，绝不信任客户端自报的 `x-user-id` 头（该信任路径已删除，知道他人 uid 无法再消耗其额度/读其报告）
- 14 个业务路由签名不变，仅身份来源切换；管理端路由用 `requireAdmin()` 守卫（替代旧 admin_token/ADMIN_UIDS/ADMIN_ALLOWED_DEVICES 一套，均已作废删除）
- 时序防枚举：用户名不存在时同样对 `DUMMY_PASSWORD_HASH` 跑完整 scrypt，"用户不存在"与"密码错误"耗时一致、响应相同

**登录防爆破（`lib/login-rate-limit.ts`）：**
- 按用户名（大小写归一）计数：15 分钟窗口内连续失败 5 次 → 锁定 15 分钟（429 `too_many_attempts`）；成功清零
- 进程内存 TtlMap，重启即失效、多实例各自独立——已接受的权衡（无 Redis），兜底靠 scrypt 慢哈希 + 发放制账号
- 超 1000 个跟踪键时惰性清扫过期条目，防用户名随机化撑爆内存

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
- **外部依赖**（不打包进镜像）：MySQL 8.0（账号体系自建，已无 TCB 等第三方鉴权服务）

## 文件结构

```
├── app/
│   ├── admin/page.tsx                 # 管理后台
│   ├── api/
│   │   ├── admin/
│   │   │   ├── funnel/route.ts       # 报告付费漏斗统计（管理员）
│   │   │   └── users/route.ts        # 账号管理：建号/发放次数/重置密码/列表（管理员）
│   │   ├── auth/
│   │   │   ├── login/route.ts        # 统一登录（防爆破/防枚举 + 会话 cookie）
│   │   │   ├── logout/route.ts       # 登出
│   │   │   └── me/route.ts           # 当前登录态
│   │   ├── chat/route.ts              # AI 对话
│   │   ├── docs/route.ts              # API 文档
│   │   ├── events/route.ts            # 客户端埋点上报（漏斗事件白名单）
│   │   ├── labor-reports/             # 维权报告历史列表/单条/删除
│   │   ├── report/route.ts            # 维权方案报告（付费，服务端重算）
│   │   ├── scenarios/                # 场景模板 API
│   │   └── usage/                    # 额度查询（GET）
│   ├── components/
│   │   ├── CompensationForm.tsx       # 赔偿金计算器表单
│   │   ├── HistoryPanel.tsx           # 历史记录面板
│   │   ├── LaborHistoryPanel.tsx      # 维权报告历史抽屉（降级空态/删除二次确认）
│   │   ├── LoginModal.tsx             # 登录弹窗 + useAuth（数据源 /api/auth/me）
│   │   ├── ReportPanel.tsx            # 维权报告生成面板（含目录 chip 导航 + 自管「如何购买」指引）
│   │   ├── markdown.tsx               # 网页端 markdown 渲染共享配置（remark-gfm + 组件样式 + 禁用元素 + 标题锚点/目录提取）
│   │   ├── ScenarioCard.tsx          # 场景卡片
│   │   ├── ScenarioModal.tsx          # 场景详情弹窗
│   │   └── ui/PurchaseGuide.tsx       # 「如何购买」指引卡（微信号展示，无自助输入）
│   ├── docs/page.tsx                 # API 文档页
│   ├── labor/page.tsx                # 劳动维权主页
│   └── page.tsx                      # 主页
├── lib/
│   ├── compensation.ts               # 赔偿金计算纯函数（第40/47/87条）
│   ├── social-wage.ts                # 城市社平工资封顶表
│   ├── db.ts                         # MySQL 连接池
│   ├── conversations.ts             # 对话历史 MySQL 持久化
│   ├── subscriptions.ts             # 订阅额度 MySQL（发放 grantUsageByUid / 消耗）+ 内存缓存
│   ├── usage-events.ts              # 使用事件追踪 + 场景统计 + 报告漏斗聚合
│   ├── analytics-client.ts          # 客户端埋点 trackEvent（fire-and-forget）
│   ├── models.ts                    # 模型配置
│   ├── ratelimit.ts                 # 限流 + deviceId 防伪
│   ├── ttl-map.ts                   # 进程内 TTL 存储（限流/防爆破/订阅读缓存）
│   ├── kv.ts                        # MySQL kv_store（无 MySQL 时自动降级内存）
│   ├── chat-quota.ts               # 对话额度决策纯函数（CHAT_FREE_PER_DAY）
│   ├── free-count.ts                # 每日免费对话次数（kv_store 持久化，按 uid）
│   ├── user-auth.ts                 # 自建账号：scrypt 哈希/会话/建号/管理员引导
│   ├── api-auth.ts                  # API 身份 chokepoint（uid/role 仅来自验签会话）
│   ├── login-rate-limit.ts          # 登录失败限流（按用户名 5 次/15 分钟）
│   ├── report-docx.ts               # 报告 markdown → .docx（Mac Word 兼容子集）
│   ├── labor-reports.ts             # 维权报告持久化（saved/skipped 显式降级）
│   ├── scenarios.ts                # 场景数据
│   ├── storage.ts                  # LocalStorage（客户端缓存）
│   └── subscription.ts             # 订阅逻辑（入口）
├── sql/
│   └── migrations/
│       └── 001_initial.sql         # MySQL 全量最终态建表语句
├── test/
│   ├── chat-quota.test.ts           # 对话额度决策表格驱动测试
│   ├── compensation.test.ts         # 赔偿金计算表格驱动测试
│   ├── markdown-render.test.ts      # 网页端 markdown/GFM 表格渲染 + 目录锚点测试
│   ├── user-auth.test.ts            # scrypt/会话/登录限流表格驱动测试
│   ├── auth-routes.test.ts          # login/logout/me 端点测试
│   ├── api-auth.test.ts             # 会话验签身份上下文测试
│   ├── admin-users-route.test.ts    # 账号管理端点测试（建号带 times/追加 addTimes/usage 列表）
│   ├── subscriptions.test.ts        # 发放/消耗额度 MySQL 层表格驱动测试（mock db）
│   ├── report-docx.test.ts          # docx 转换/语法子集/Mac 坑回归测试
│   ├── labor-reports.test.ts        # 报告持久化降级（skipped）测试
│   └── report-prompt.test.ts        # 报告 prompt 断言测试
├── .env.local.example
└── package.json
```

## API

### GET /api/usage

查询当前用户的额度状态（购买次数 = 报告货币，管理端发放、永久有效；对话另有每日免费额度）。

Headers: `x-device-id` + 会话 Cookie（uid 取自验签会话；未登录 `uid=null`，返回未付费视角）

响应（`total` = 累计发放次数，`remaining` = 当前剩余）：
```json
{ "allowed": true, "remaining": 5, "isPaid": true, "total": 8, "chatFreeRemaining": 8, "chatFreeTotal": 10 }
```

### POST /api/chat

AI 对话。登录用户每日 10 次免费；免费额度用尽后，付费用户需带 `confirmPaid: true` 重发以消耗 1 次购买额度。

Headers: `x-device-id` + 会话 Cookie（uid 来自验签会话，不再接受 `X-User-Id` 头）

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

Headers: `x-device-id` + 会话 Cookie（uid 来自验签会话，不再接受 `X-User-Id` 头）

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
  "narrative": "公司以架构调整为由口头通知离职…",
  "confirmPaid": false
}
```

`dismissalType` 枚举：`mutual | no-fault-40 | illegal | expired | forced-resign`。

`confirmPaid`：付费用户首次调用置 `false`（默认，探测请求不计 /api/report 限流），后端返回 402 `report_quota_confirm` 并附 `paidRemaining`；前端弹出自绘确认 Modal（展示剩余额度 N→N-1 与预计回款金额），用户确认后置 `true` 重发（此时才消耗限流额度）；取消不上报生成。不传等同于 `false`。

响应：
```json
{
  "reply": "## 一、赔偿明细核对 …（五段式报告，正文末尾附免责声明）",
  "computation": { "severanceN": 120000, "total": 128500, "lines": [], "warnings": [] }
}
```

错误：402 `report_quota_confirm`（付费用户需确认消耗 1 次额度，body 含 `paidRemaining`，前端确认后带 `confirmPaid: true` 重发）、403 `login_required`（无有效会话）、403 `paid_only`（非付费用户）、403 `no_quota`（次数用完）、400 `invalid_input`、429 限流、500 `AI error`（生成失败，不扣额度）、500 `settle_failed`（报告已生成但扣量 DB 异常，body 仍带 `reply`，前端展示报告并提示联系客服补偿）。

漏斗记账：两个 403 拦截分支（`paid_only`/`no_quota`）由**服务端**记录 `paywall_block`（`meta.reason` 区分原因；比客户端上报更可靠，且 uid 已知），前端无需也**不允许**上报该事件。

副作用：成功后报告入库到 `labor_reports`（uid + comp_json + computation_json + reply + created_at），用户后续可在 `/labor` 历史抽屉找回；同时以独立事件 `report_generate` 写入 `usage_events`（不再计入 chat 计数与 `scenario_stats`）。**落库与扣量是两种失败模式**：扣量失败 → 500 `settle_failed`（带 reply，见上）；落库失败/未启用 → 200 + `warning` 字段（报告已返回，仅提示历史保存失败），不阻塞主流程——**扣了额度却不落库必须显式告知用户**。`saveLaborReport` 返回 `"saved" | "skipped"`：未配置 MySQL 时返回 `skipped`，route 据此在响应中置 `saveWarning`（"历史保存暂不可用，本次报告不会存入历史，请立即下载或复制保存"）；配置后遇真实 DB 错误抛出，同样转成 warning。

### POST /api/events

客户端埋点上报（报告付费漏斗等）。fire-and-forget，落库失败不阻塞。

Headers: `x-device-id`（必须）+ 会话 Cookie（可选，uid 取自验签会话，不再接受 `X-User-Id` 头）；复用 `/api/usage` 限流档位（30 次/分钟）+ deviceId 防伪。

请求：
```json
{ "eventType": "paywall_confirm", "meta": { "city": "北京" } }
```

`eventType` 白名单（仅客户端可报，服务端事件如 `report_generate/paywall_block` 不在列，防伪造；已退役的 `activate/activate_success` 不在枚举内 → 客户端上报一律 400）：`calculator | paywall_view | paywall_confirm | paywall_cancel | report_download | login_gate`。

响应：204（成功，无 body）。

错误：400 `invalid_event_type` / 缺 eventType / 缺 deviceId、403 `device_id_rejected`、429 限流。

客户端封装：`lib/analytics-client.ts` 的 `trackEvent(eventType, { meta? })`——**客户端不自报 uid**，归属由服务端从会话 cookie 解析；异常静默吞掉，绝不影响主流程（埋点是非关键路径，此处静默是有意设计，关键错误处理在服务端 `recordEvent` 内显式 `console.error`）。

### GET /api/labor-reports

列出当前 uid 的维权报告历史（最多 50 条，按 created_at DESC）。

Headers：会话 Cookie（uid 取自验签会话）

响应：
```json
{ "reports": [{ "id": "r_xxx", "uid": "u1", "comp": {...}, "computation": {...}, "reply": "…", "narrative": "…", "intakeAnswers": {...}, "createdAt": 1700000000000 }], "degraded": false }
```

`degraded` = MySQL 不可用。前端据此区分"**服务暂不可用**"与"暂无历史"两种空态——降级时 `reports` 恒为 `[]`，若不加标记用户会误以为历史丢了。

错误：401 `login_required`（无有效会话）。

### GET /api/labor-reports/:id

按 id + uid 取单条报告（uid-scoped 防越权）。

Headers：会话 Cookie（uid 取自验签会话）

响应：
```json
{ "report": { "id": "r_xxx", "...": "..." } }
```

错误：401 `login_required`（未登录）、404 `not_found`（id 不存在或不属于当前 uid）。

### DELETE /api/labor-reports/:id

按 id + uid 删除单条报告。

Headers：会话 Cookie（uid 取自验签会话）

响应：`{ "success": true }`

错误：401 `login_required`（未登录）。

### 客户端：网页 Markdown 渲染（`app/components/markdown.tsx`）

AI 报告正文（含历史抽屉、聊天页）统一用 react-markdown 渲染。react-markdown 默认只支持 CommonMark，管道符表格（GFM）会原样显示成一长行文本，因此共享模块导出三件套，三处 `<ReactMarkdown>`（`ReportPanel.tsx`、`LaborHistoryPanel.tsx`、`app/page.tsx`）全部引用同一配置，避免样式/安全配置漂移：

- `remarkPlugins = [remarkGfm]`：启用 GFM，证据清单等表格渲染为带边框真实 `<table>`，外层包 `overflow-x-auto` 容器防窄屏溢出；表头 `bg-[var(--background-secondary)]` 加粗，单元格边框用 `var(--card-border)`
- `markdownComponents`：p/h2/h3/ul/ol/li/strong/blockquote/pre + table/th/td 样式，沿用 Tailwind + CSS 变量模式；h2 额外挂锚点 `id`
- `disallowedElements`：script/style/iframe/object/embed/applet/form/meta/link/body/html/head（三处原配置的并集；react-markdown 本身不渲染原始 HTML，此为纵深防御）
- `headingId(text)` / `extractToc(markdown)`：报告目录的配对工具——h2 渲染 `id="toc-<文本空格转连字符>"`，`extractToc` 从 markdown 源提取全部 `## ` 级标题。`ReportPanel` 生成报告后据此在 Card 顶部渲染横向滚动 chip 目录条（点击 `scrollIntoView` 平滑定位；`##` 少于 2 个时不显示），不引入 TOC 库

渲染行为由 `test/markdown-render.test.ts` 用 `renderToStaticMarkup` 做表格驱动断言（表格渲染、混排、既有语法回归、script 不生成可执行标签、TOC 提取/锚点 id 配对）。docx 导出链路不受影响（`lib/report-docx.ts` 有自己的表格解析）。

### 客户端：Word 报告生成（`lib/report-docx.ts`）

报告展示页提供"下载 Word"按钮，调用 `markdownToDocxBlob(reply, opts)` 把 AI 输出的五段式 markdown 转成 `.docx` Blob，再通过 `triggerDocxDownload` 触发浏览器下载。`markdownToDocxBlob` 失败（`Packer.toBlob` reject）时按钮捕获异常并给出可见错误提示，不再静默；"复制全文"走 `lib/utils.ts` 的 `copyTextToClipboard`（clipboard API 失败降级 `execCommand`），两者都失败时按钮显示"复制失败"而非假装成功。

- **单 section + `titlePage: true`**（非双 section，见下方坑 #2）：整个文档只有一个 section，封面页作为首页、正文从第二页开始，靠段落的 `pageBreakBefore` 分隔（非独立 PageBreak，见坑 #3）。
  - **封面页**（section 首页，titlePage 使首页页眉/页脚独立）：居中标题"维权方案报告"（22pt 微软雅黑 bold 蓝色 #2E5C8A）+ "生成日期：YYYY-MM-DD" + 可选 "UID：{uid}"
  - **正文**（首段带 `pageBreakBefore`）：
    - 页眉左侧"维权方案报告"、右侧生成日期（9pt 微软雅黑灰色）
    - 页脚居中"第 X 页 / 共 Y 页"（PAGE / NUMPAGES 字段，由 Word/WPS 打开时替换为实际页码）
    - 正文 11pt 微软雅黑、行距 1.5
- **Markdown 解析（block-by-block，语法子集与网页端对齐）**：
  - `##` → `Heading1`、`###` → `Heading2`、`-` → bullet、`1.` → numbered
  - 内联：`**bold**` → 加粗、`*italic*` → 斜体（先粗后斜同一正则共存）
  - `> ` 引用块 → 左缩进 480 twip + 斜体段（对齐网页 blockquote 风格；官方免责声明即受益于此，不再导出成裸 `>` 符号）
  - `---`（≥3 个连字符独占一行）→ 细横线段（下边框 single 6pt #999999）
  - 管道表格 `| col1 | col2 |` + 分隔行 `|---|---|` → `<w:tbl>`，表头加粗 + #F5F5F5 底色 + 全边框（single 4pt #999999）
  - 单元格内文本继续走内联解析
  - **不支持语法的源头约束**：图片/代码块/内嵌 HTML 不渲染，`REPORT_SYSTEM_PROMPT`（`lib/models.ts`）已明确告知模型排版语法仅限上述子集——约束落在生成端，导出与网页天然对齐
  - 对应回归：`test/report-docx.test.ts` 扩展语法表格（含 XML 级 `<w:ind`/`<w:pBdr>`/`<w:i/>` 断言）+ 不支持语法降级用例
- **opts**：
  - `generatedAt?: Date`（默认 `new Date()`）—— 封面与页眉的日期来源
  - `uid?: string` —— 封面第三行"UID：{uid}"；不传时不渲染该行
- **调用约定**：
  - `ReportPanel.tsx` 新报告用 `markdownToDocxBlob(rawReply, { uid: uid ?? undefined })`
  - `LaborHistoryPanel.tsx` 历史报告用 `markdownToDocxBlob(report.reply, { generatedAt: new Date(report.createdAt) })`（沿用报告原始生成时间）

#### Mac Word 兼容性踩坑（commit 205b5f0 / 11d4a6b / ffef1fe / c46aaff / c749712 / 106a51f）

Mac Word 对 docx 库输出比 Pages/WPS 严格得多，会因各种 OOXML schema 不严格符合而直接拒打开。下列每条都必须满足，否则用户生成报告后会看到 "Word 在试图打开文件时遇到错误"。Pages/Pages 替我们做了兼容性补救，所以同样的文件 Pages 能打开、Word 不能。

1. **页码字段用 SimpleField 不用 PageNumber**：`new SimpleField("PAGE", "1")` 生成 `<w:fldSimple>` + cached run；`PageNumber.CURRENT` 生成 `begin/separate/end` 复杂字段，部分 Word 版本拒绝打开。
2. **单 section + titlePage=true**：避免 docx 库在 section 边界自动插入空 `<w:p><w:pPr><w:sectPr/></w:pPr></w:p>`（无 `<w:r>`），Mac Word 严格模式拒绝。
3. **pageBreakBefore 不用独立 PageBreak 段落**：`new Paragraph({ pageBreakBefore: true })` 替代 `new Paragraph({ children: [new PageBreak()] })`。Mac Word 对独立 PageBreak 段落有时报"unreadable content"。
4. **表格表头不能空 `<w:r>`**：`renderTable` 表头处 `parseInline(cell).map((r) => new TextRun({ ...r, bold: true }))` 看似正确，但 spread docx `TextRun` 实例会丢失 `text` 字段（docx 内部用嵌套 root 树存 text，不在 enumerable own properties 上），结果只输出 `<w:r><w:rPr><w:b/></w:rPr></w:r>` 无 `<w:t>`。`parseInline` 改返 `{ text, bold }[]` 纯数据 + 新 helper `toTextRuns` 统一构造。
5. **titlePage 模式下必须补 first-page header/footer reference**：`<w:titlePg/>` 启用时 Mac Word 要求 sectPr 含 `type="first"` 的 headerReference + footerReference（Word 用 first-page header 渲染封面页；缺失时渲染路径异常）。给 `headers.first` / `footers.first` 加空 Header/Footer，docx 库自动生成 `header2.xml` / `footer2.xml` 并正确声明 reference。
6. **数字列表必须注册 reference**：`renderLine` 里 `numbering: { reference: "default-numbering", level: 0 }` —— 如果 `Document.numbering.config` 没注册同名 reference，docx 库会把 reference 字面输出为 `<w:numId w:val="{default-numbering-0}"/>`，违反 OOXML schema 的 `ST_DecimalNumber` 类型（必须是数字）。Mac Word 严格模式拒打开。修复：在 `Document.numbering.config` 注册 `default-numbering`（level 0 = decimal `%1.`），docx 库正确解析为真实 numId。

**回归钉死**：坑 #2（`document.xml` 中 `<w:sectPr` 恰好出现 1 次）与坑 #3（全文档不得含 `<w:br w:type="page"`、正文首段必须含 `<w:pageBreakBefore`）已在 `test/report-docx.test.ts` 补 XML 级表格断言，防止后续改动把 Mac Word 兼容性悄悄改坏。

**如何快速定位新 bug**：如果新版本生成的 docx 在 Mac Word 打不开但 Pages 能开，做以下二分：
- 用 Python `zipfile` + `xml.etree.ElementTree` 校验所有 part 解析通过
- 用 Python `python-docx` 库 `Document(path)` 看是否能打开（python-docx 严格按 OOXML 标准，能开 = 文件结构合法）
- 隔离替换：把出问题的 docx 的 `word/document.xml`、`word/header1.xml`、`word/footer1.xml`、`word/styles.xml` 逐个换成 Pages 转存版本，看哪个 part 替换后 Word 能开
- 砍 document.xml body 长度二分定位问题段
- 关键搜索：`grep -oE '<w:r><w:rPr>[^<]*</w:rPr></w:r>'`（空 run）、`<w:numId w:val="[^"]*"`（numId 必须是数字）、`<w:[a-z]+ w:type="[^"]*"` 计数（first/default 配对）、`<w:t[^/]*/>`（空文本）

### POST /api/auth/login

统一登录（用户与管理端共用；旧的 `POST /api/admin/login` 密码/设备白名单一套已删除）。

请求：`{ "username": "xxx", "password": "xxx" }`

响应：成功 Set-Cookie `session`（httpOnly/lax/secure-prod/7d）+ `{ "ok": true, "username", "role" }`，前端按 `role` 决定跳转（admin→`/admin`）。

错误：400 `missing_credentials`、401 `invalid_credentials`（用户不存在与密码错同形，防枚举）、429 `too_many_attempts`（按用户名 5 次/15 分钟）、500 `server_error`。登录成功路径顺带执行 `ensureAdminUser()` 幂等引导管理员。

### POST /api/auth/logout

登出。**先清 cookie 再删 sessions 行**；删库失败不回滚退出，而是返回 `{ "ok": true, "sessionPurged": false }` 显式告知服务端 token 仍残留（最长 7 天）。

### GET /api/auth/me

当前会话用户，供前端 `useAuth` 挂载时拉取。

响应：200 `{ "uid", "username", "role" }`；无有效会话 401 `unauthorized`。

### /api/admin/users（GET/POST/PATCH，需 admin 会话）

账号管理（`requireAdmin()` 守卫；非登录 401，登录但非 admin 403 `not_admin`）。

- `GET`：`{ "users": [{ id, username, role, remainingUsage, totalUsage }] }`（最多 200 条；LEFT JOIN subscriptions，无发放记录 COALESCE 为 0）
- `POST { username, times? }`：建普通用户号，`createUser` 生成随机初始密码（`xxxx-xxxx-xxxx`），**明文仅在响应中出现一次** `{ id, username, password, remaining }`；可选 `times`（1–999 整数）建号后 `grantUsageByUid` 发放初始次数；用户名重复 409 `username_taken`、username/times 非法 400（`invalid_username`/`invalid_times`）；建号成功但发放失败 → 500 `grant_failed`（账号已存在，管理员可对同账号重试 +N 追加）
- `PATCH { userId, addTimes }`：追加次数 → 先 `userExists` 校验（防孤儿订阅行）再 `grantUsageByUid`，返回 `{ userId, remaining }`；addTimes 非法 400 `invalid_times`、用户不存在 404 `user_not_found`
- `PATCH { userId }`：重置密码 → 返回新一次性明文 `{ userId, password }`，并清空该用户全部 sessions（强制重登）；用户不存在 404 `user_not_found`

### GET /api/admin/funnel

报告付费漏斗统计（`requireAdmin()` 会话守卫）。

响应：
```json
{
  "funnel": {
    "calculator":      { "count": 0, "users": 0 },
    "loginGate":       { "count": 0, "users": 0 },
    "paywallView":     { "count": 0, "users": 0 },
    "paywallBlock":    { "count": 0, "users": 0 },
    "paywallConfirm":  { "count": 0, "users": 0 },
    "paywallCancel":   { "count": 0, "users": 0 },
    "reportGenerate":  { "count": 0, "users": 0 },
    "reportDownload":  { "count": 0, "users": 0 }
  },
  "rates": { "confirmToView": 62.5, "generateToConfirm": 80.0, "downloadToGenerate": 50.0 }
}
```

`count` 为事件次数，`users` 按 `COALESCE(uid, device_id)` 去重；分母为 0 时对应转化率为 `null`。无 MySQL 时全部降级为 0/`null`，不报错。`/admin` 页面登录态下以"报告付费漏斗"卡片展示。

## 环境变量

| 变量名 | 必需 | 默认值 | 说明 |
|--------|------|--------|------|
| DEFAULT_MODEL | 是 | deepseek | 模型 |
| DEEPSEEK_API_KEY | 是 | - | DeepSeek Key |
| MINIMAX_API_KEY | 是 | - | MiniMax Key |
| ADMIN_USERNAME | 生产建议 | - | 管理员初始用户名（与 ADMIN_PASSWORD 齐备时登录幂等引导；缺失则无管理员入口） |
| ADMIN_PASSWORD | 生产建议 | - | 管理员初始密码（普通用户账号由管理端创建发放，不走环境变量） |
| MYSQL_HOST | 生产 | localhost | MySQL 主机 |
| MYSQL_PORT | 生产 | 3306 | MySQL 端口 |
| MYSQL_USER | 生产 | - | MySQL 用户名 |
| MYSQL_PASSWORD | 生产 | - | MySQL 密码 |
| MYSQL_DATABASE | 生产 | - | MySQL 数据库名 |
| MYSQL_USE_SSL | 否 | false | MySQL SSL 连接 |
| USE_LOCAL_STORAGE | 测试 | true | true=LocalStorage，false=MySQL |
| CHAT_FREE_PER_DAY | 否 | 10 | 每日免费对话次数 |