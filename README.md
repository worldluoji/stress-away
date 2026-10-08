# 反PUA手册

面向大城市高压青年的 AI 智能体 —— 免费估算裁员赔偿（N+1/2N），一键生成劳动维权方案与仲裁申请书；同时提供职场反PUA应对话术。

## 功能

### 劳动维权（核心付费功能）
- **赔偿金计算器**（`/labor`，免费无需登录）：依据《劳动合同法》第40/47/87条实时估算 N、2N、代通知金、加班费（150%/200%/300%）、未休年假折算；含高薪双封顶（3×社平、12年）与取整规则，规则由表格驱动单元测试钉死
- **维权方案报告**（付费，消耗 1 次报告额度）：AI 生成五段式报告——赔偿明细核对、证据清单、仲裁流程时间线（时效1年/受理5日/审期45+15日）、仲裁申请书草稿、风险与谈判策略；金额由服务端重算后注入，防篡改
- **报告展示**：网页端启用 GFM 表格渲染（remark-gfm），AI 输出的证据清单等管道符表格渲染为带边框的真实表格（窄屏横向滚动）；markdown 渲染配置统一收口在 `app/components/markdown.tsx`，报告面板/历史抽屉/聊天页三处复用；报告卡顶部附「## 级标题」锚点目录（横向滚动 chip 导航，点击平滑滚动定位）
- **报告复制/下载**：生成后可一键复制全文（raw markdown 入剪贴板），或下载为 Word（.docx）便于提交仲裁或转发律师；导出支持网页同款语法子集——标题/列表/**粗体**/*斜体*/> 引用块/--- 分割线/管道表格（禁图片/代码块/内嵌 HTML）
- **报告历史**：付费用户生成的报告自动入库（`labor_reports` 表，最多 50 条）；`/labor` 头部时钟按钮可拉抽屉查看历史，点击行展开全文并复用复制/下载，刷新或关窗口后仍可找回；删除走站内二次确认弹窗；MySQL 不可用时生成响应附"历史保存暂不可用"提醒、历史抽屉显示"服务暂不可用"空态（与"暂无历史"区分）
- **付费明示**：点击生成时弹出自绘确认框，展示「剩余额度 X 次 → 本次后 X-1 次」与「预计回款 ¥…」，用户确认后才真正扣费；AI 失败时不扣；402 探测请求不消耗限流额度
- **付费漏斗埋点**：计算器 → 登录墙(login_gate) → 付费墙曝光(paywall_view) / 拦截(paywall_block，403 时服务端记录) → 确认/取消 → 报告生成 → Word 下载，全链路事件写入 `usage_events`，`/admin` 漏斗卡片展示各步次数/人数与转化率
- **社平工资表**：内置 30 个高频城市封顶基数（`lib/social-wage.ts`），每条记录含人社局来源 URL 与生效日期，`WageRecord.isEstimate` 标记是否经人社局核对（默认 `true`，人工核对后改 `false`）；表单下方内嵌"当地社平工资"输入框，默认值显示系统估算，提示用户核对当地人社局公告后覆盖；未收录城市自动回退到所属省份省会数据作为代理；年度人工更新，不做自动 pipeline
- **免责**：全程标注"AI 生成、不构成律师意见、以仲裁认定为准"

### 核心功能
- **AI 反PUA建议**：描述职场困境，AI 生成定制化建议（话术反击、心态调整、行动建议、法律参考）
- **场景模板**：内置 12 个常见职场困境模板，支持场景细分问答生成专属话术
- **聊天历史**：对话记录持久化存储（MySQL），跨设备同步
- **历史记录**：保存最多50条历史对话，可切换/删除/继续追问

### 账号与订阅
- **自建账号体系**：用户名+密码登录，**无自助注册**，账号由管理员在 `/admin`「账号管理」生成并一次性发放初始密码；会话为 sessions 表（token 仅存 SHA-256）+ httpOnly Cookie（7 天），可随时吊销；已彻底移除腾讯云 TCB 依赖
- **报告付费墙**：维权报告仅限付费用户生成（403 `paid_only`），购买次数即"报告货币"；计算器免费、话术聊天为免费获客漏斗
- **管理端发放制**：报告次数由管理员在 `/admin`「账号管理」直接发放——建号时可写入初始次数，存量账号可随时增量追加（`+N` 累加）；**激活码/面包多体系已全部退役**
- **次数永久有效**：无有效期、无过期概念，付费判定即 `remaining_usage > 0`；`total_usage` 记录累计发放
- **免费对话**：登录用户每天 10 次免费对话，不消耗购买次数；超出后付费用户确认消耗 1 次购买额度可继续对话（未付费引导"如何购买"）
- **购买指引**：用户命中未付费/无额度时弹出「如何购买」指引卡（添加管理员微信购买，无自助输入框）
- **管理后台**：管理员使用 `ADMIN_USERNAME/ADMIN_PASSWORD` 引导出的账号登录（与用户同一套 `/api/auth/login`，按 role 区分），可创建/重置用户账号、发放/追加报告次数、查看账号剩余额度、查看报告付费漏斗（`/admin`）

### 安全保护
- **限流**：设备 ID + IP 双重限制，防止恶意攻击
- **登录防爆破**：按用户名计数，连续失败 5 次锁定 15 分钟（进程内存，用户与管理员共用登录接口）；用户不存在与密码错误响应耗时一致（假哈希走完整 scrypt），防时序枚举
- **会话安全**：uid 唯一来源是服务端验签的会话 Cookie，API 不再信任任何客户端自报的 `x-user-id` 头；重置密码即时清空该用户全部会话
- **输入限制**：用户输入最多600字，前端+后端双重校验

### 模型配置
- 支持 DeepSeek V4 Flash / MiniMax 2.7
- 通过环境变量选择

## 技术栈

- **框架**: Next.js 16 + React 19
- **语言**: TypeScript
- **测试**: Vitest（表格驱动单元测试）
- **样式**: Tailwind CSS 4
- **Markdown 渲染**: react-markdown + remark-gfm（GFM 表格）
- **AI**: DeepSeek / MiniMax API
- **存储**: MySQL 8.0（生产，含 users/sessions 账号表）/ LocalStorage（测试）
- **鉴权**: 自建账号（scrypt 密码哈希 + sessions 表 + httpOnly Cookie，无第三方登录 SDK）
- **缓存/计数**: 进程内内存（限流、防爆破、订阅读缓存 60s TTL）+ MySQL kv_store（每日免费对话计数、deviceId 防伪）
- **变现**: 管理端发放制（管理员给用户账号加报告次数，无自助支付/激活码）
- **部署**: Docker (multi-stage, Next.js standalone)

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

# 管理员初始账号（两者齐备才引导；普通用户账号由管理员在 /admin「账号管理」创建后发放）
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your_admin_password

# MySQL（生产）
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=your_password
MYSQL_DATABASE=stress_away
MYSQL_USE_SSL=false

# 开发模式（true = 用 LocalStorage，false = 用 MySQL）
USE_LOCAL_STORAGE=false
CHAT_FREE_PER_DAY=10
```

### 4. 初始化数据库

执行全量建表脚本（历史迁移已合并至单一文件，可重复执行）：

```bash
mysql -u root -p < sql/migrations/001_initial.sql
```

### 5. 启动

```bash
pnpm dev
```

访问 http://localhost:8989

### 6. 运行测试

```bash
pnpm test
```

## Docker 部署

### 前置条件

确保项目根目录存在 `.env.production`（Next.js 需要在 `pnpm build` 阶段读取它，将所有 `NEXT_PUBLIC_*` 变量内联到客户端 bundle）。如果你还没准备好，从 `.env.local.example` 复制一份并填入实际值：

```bash
cp .env.local.example .env.production
# 编辑 .env.production；若部署在子路径下填入 NEXT_PUBLIC_BASE_PATH（当前唯一构建时变量）
```

### 构建镜像

```bash
docker build -t stress-away:latest .
```

构建过程中会读取 `.env.production`，将 `NEXT_PUBLIC_*` 变量内联到 JS 产物中。

### 运行容器

```bash
docker run --rm -p 3000:3000 --env-file .env.production stress-away:latest
```

访问 http://localhost:3000

### 环境变量分类

| 阶段 | 变量类型 | 注入方式 | 说明 |
|------|----------|----------|------|
| 构建时 | `NEXT_PUBLIC_*` | 通过 `.env.production`（`docker build` 时读取） | 会被内联到客户端 JS |
| 运行时 | 其他变量 | `docker run --env-file .env.production` | 仅服务端代码可读，客户端不可见 |

> 安全性：Dockerfile 在最终镜像中会显式删除 `.env.production`（Next.js 16 standalone 模式会自动把它复制到 `.next/standalone/`）。因此最终镜像内**不含** `.env.production` 文件，但 `NEXT_PUBLIC_*` 变量已存在于客户端 JS 中（这是 `NEXT_PUBLIC_*` 设计的固有特性，无法避免）。

## 管理后台

访问 `/admin`，用 `ADMIN_USERNAME/ADMIN_PASSWORD` 引导的管理员账号登录后（非管理员账号会被拒"当前账号无管理权限"）可：
- 账号管理：创建用户账号（可选写入初始报告次数，展示一次性初始密码、明文仅此一次）、重置用户密码（即时清空其全部会话强制重新登录）
- 发放次数：每个账号行「+N」内联追加报告次数（累加、永久有效），列表显示「剩余 X 次 / 累计发放 Y」
- 查看报告付费漏斗（计算器→登录墙→曝光/拦截→确认→生成→下载 各步次数/人数与转化率，数据来自 `usage_events`）

## 文件结构

```
├── app/
│   ├── admin/page.tsx                 # 管理后台页面
│   ├── api/
│   │   ├── admin/
│   │   │   ├── funnel/route.ts       # 报告付费漏斗统计（管理员）
│   │   │   └── users/route.ts        # 账号管理：建号/发放次数/重置密码/列表（管理员）
│   │   ├── auth/
│   │   │   ├── login/route.ts        # 用户名+密码登录（防爆破 + 会话 cookie）
│   │   │   ├── logout/route.ts       # 登出（清 cookie + 删会话行）
│   │   │   └── me/route.ts           # 当前登录态（前端 useAuth 数据源）
│   │   ├── chat/route.ts              # AI 对话
│   │   ├── events/route.ts            # 客户端埋点上报（事件白名单）
│   │   ├── report/route.ts            # 维权方案报告（付费，服务端重算金额，落库历史）
│   │   ├── labor-reports/             # 维权报告历史列表/单条/删除
│   │   ├── scenarios/                 # 场景模板
│   │   └── usage/                     # 额度查询（GET）
│   ├── components/
│   │   ├── CompensationForm.tsx       # 赔偿金计算器表单（客户端实时估算）
│   │   ├── HistoryPanel.tsx           # 历史记录面板
│   │   ├── ReportPanel.tsx            # 维权报告生成面板
│   │   ├── LaborHistoryPanel.tsx      # 维权报告历史抽屉
│   │   ├── LoginModal.tsx             # 登录弹窗（用户名+密码，账号由管理员发放）
│   │   ├── markdown.tsx               # 网页端 markdown 渲染共享配置（remark-gfm + 组件样式 + 禁用元素 + 标题锚点/目录提取）
│   │   ├── ScenarioCard.tsx           # 场景卡片
│   │   ├── ScenarioModal.tsx          # 场景详情弹窗
│   │   └── ui/PurchaseGuide.tsx       # 「如何购买」指引卡（微信号展示，无自助输入）
│   ├── labor/page.tsx                 # 劳动维权主页
│   └── page.tsx                       # 主页
├── lib/
│   ├── compensation.ts               # 赔偿金计算纯函数（第40/47/87条，表格驱动测试）
│   ├── social-wage.ts                # 城市社平工资封顶表（带时效标注）
│   ├── db.ts                         # MySQL 连接池
│   ├── conversations.ts               # 对话历史 MySQL 持久化
│   ├── subscriptions.ts              # 订阅额度 MySQL（发放/消耗）+ 内存缓存
│   ├── report-docx.ts                # 报告 markdown → .docx Blob + 下载触发
│   ├── labor-reports.ts              # 维权方案报告持久化（uid-scoped）
│   ├── usage-events.ts               # 使用事件追踪 + 场景统计 + 报告漏斗聚合
│   ├── analytics-client.ts           # 客户端埋点 trackEvent（fire-and-forget）
│   ├── models.ts                    # 模型配置
│   ├── ratelimit.ts                 # 限流 + deviceId 防伪
│   ├── ttl-map.ts                   # 进程内 TTL 存储（限流/防爆破/订阅读缓存）
│   ├── kv.ts                        # MySQL kv_store（无 MySQL 时自动降级内存）
│   ├── chat-quota.ts                # 对话额度决策纯函数（表格驱动测试）
│   ├── free-count.ts                # 每日免费对话计数（kv_store 持久化，按 uid）
│   ├── user-auth.ts                 # 自建账号：scrypt 哈希/会话 Cookie/建号/管理员引导
│   ├── api-auth.ts                  # API 身份 chokepoint（uid/role 仅来自验签会话）
│   ├── login-rate-limit.ts          # 登录失败限流（按用户名 5 次/15 分钟锁定）
│   ├── scenarios.ts                 # 场景数据
│   ├── storage.ts                 # LocalStorage（客户端缓存）
│   └── subscription.ts             # 订阅逻辑（入口）
├── test/
│   ├── chat-quota.test.ts             # 对话额度决策表格驱动测试
│   ├── compensation.test.ts           # 赔偿金计算表格驱动测试
│   ├── report-prompt.test.ts          # 报告 prompt 断言测试
│   ├── report-docx.test.ts            # 报告 markdown→.docx 转换测试
│   ├── markdown-render.test.ts        # 网页端 markdown/GFM 表格渲染 + 目录锚点测试
│   ├── user-auth.test.ts              # scrypt 哈希往返/会话/登录限流表格驱动测试
│   ├── api-auth.test.ts               # 会话验签身份上下文测试（伪造头无效）
│   ├── auth-routes.test.ts            # login/logout/me 端点行为测试
│   ├── admin-users-route.test.ts      # 账号管理端点（建号/发放次数/重置/权限）测试
│   ├── subscriptions.test.ts          # 发放/消耗额度 MySQL 层表格驱动测试（mock db）
│   ├── labor-reports.test.ts          # 报告持久化无 MySQL 降级测试
│   ├── ttl-map.test.ts                # 进程内 TTL 存储表格驱动测试
│   └── kv-fallback.test.ts            # kv 无 MySQL 降级测试
├── sql/
│   └── migrations/
│       └── 001_initial.sql         # MySQL 全量最终态建表语句
└── spec.md                            # 详细规格文档
```

## 环境变量

| 变量名 | 必需 | 默认值 | 说明 |
|--------|------|--------|------|
| DEFAULT_MODEL | 是 | deepseek | 模型 |
| DEEPSEEK_API_KEY | 是 | - | DeepSeek Key |
| MINIMAX_API_KEY | 是 | - | MiniMax Key |
| ADMIN_USERNAME | 否 | - | 管理员初始用户名（与 ADMIN_PASSWORD 齐备时首次登录幂等引导） |
| ADMIN_PASSWORD | 否 | - | 管理员初始密码（引导后可在 users 表改密；普通用户账号由管理端创建） |
| MYSQL_HOST | 生产 | localhost | MySQL 主机 |
| MYSQL_PORT | 生产 | 3306 | MySQL 端口 |
| MYSQL_USER | 生产 | - | MySQL 用户名 |
| MYSQL_PASSWORD | 生产 | - | MySQL 密码 |
| MYSQL_DATABASE | 生产 | - | MySQL 数据库名 |
| MYSQL_USE_SSL | 否 | false | MySQL SSL 连接 |
| CHAT_FREE_PER_DAY | 否 | 10 | 每日免费对话次数 |