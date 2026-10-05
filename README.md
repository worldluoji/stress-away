# 反PUA手册

面向大城市高压青年的 AI 智能体 —— 免费估算裁员赔偿（N+1/2N），一键生成劳动维权方案与仲裁申请书；同时提供职场反PUA应对话术。

## 功能

### 劳动维权（核心付费功能）
- **赔偿金计算器**（`/labor`，免费无需登录）：依据《劳动合同法》第40/47/87条实时估算 N、2N、代通知金、加班费（150%/200%/300%）、未休年假折算；含高薪双封顶（3×社平、12年）与取整规则，规则由表格驱动单元测试钉死
- **维权方案报告**（付费，消耗 1 次报告额度）：AI 生成五段式报告——赔偿明细核对、证据清单、仲裁流程时间线（时效1年/受理5日/审期45+15日）、仲裁申请书草稿、风险与谈判策略；金额由服务端重算后注入，防篡改
- **报告复制/下载**：生成后可一键复制全文（raw markdown 入剪贴板），或下载为 Word（.docx）便于提交仲裁或转发律师
- **报告历史**：付费用户生成的报告自动入库（`labor_reports` 表，最多 50 条）；`/labor` 头部时钟按钮可拉抽屉查看历史，点击行展开全文并复用复制/下载，刷新或关窗口后仍可找回
- **付费明示**：点击生成时会弹出 `window.confirm` 提示「本次生成将消耗 1 次报告额度（剩余 X 次）」，用户确认后才真正扣费；AI 失败时不扣
- **社平工资表**：内置 30 个高频城市封顶基数（`lib/social-wage.ts`），每条记录含人社局来源 URL 与生效日期，`WageRecord.isEstimate` 标记是否经人社局核对（默认 `true`，人工核对后改 `false`）；表单下方内嵌"当地社平工资"输入框，默认值显示系统估算，提示用户核对当地人社局公告后覆盖；未收录城市自动回退到所属省份省会数据作为代理；年度人工更新，不做自动 pipeline
- **免责**：全程标注"AI 生成、不构成律师意见、以仲裁认定为准"

### 核心功能
- **AI 反PUA建议**：描述职场困境，AI 生成定制化建议（话术反击、心态调整、行动建议、法律参考）
- **场景模板**：内置 12 个常见职场困境模板，支持场景细分问答生成专属话术
- **聊天历史**：对话记录持久化存储（MySQL），跨设备同步
- **历史记录**：保存最多50条历史对话，可切换/删除/继续追问

### 订阅与激活
- **报告付费墙**：维权报告仅限付费用户生成（403 `paid_only`），购买次数即"报告货币"；计算器免费、话术聊天为免费获客漏斗；付费 SKU 建议 ¥9.9/1次、¥29.9/5次
- **双渠道激活**：支持面包多订单激活和管理端激活码激活
- **管理端激活码**：管理员可生成独立激活码，支持闲鱼等平台销售
- **激活码继承次数**：激活码本身记录剩余次数，换设备激活时自动继承
- **多码叠加**：每个 TCB 账号可绑定多个管理端激活码，**次数累加**、**到期时间取最晚**（`max(expires_at)`）
- **过期即失效**：订阅到期后剩余次数不可用，需绑定新码才能恢复
- **免费对话**：登录用户每天 10 次免费对话，不消耗购买次数；超出后付费用户确认消耗 1 次购买额度可继续对话（未付费引导激活）
- **激活码订阅**：购买次数优先用于生成维权报告，支持 2 个激活码
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
- **测试**: Vitest（表格驱动单元测试）
- **样式**: Tailwind CSS 4
- **AI**: DeepSeek / MiniMax API
- **存储**: MySQL 8.0（生产）/ LocalStorage（测试）
- **缓存/计数**: 进程内内存（限流、防爆破、订阅读缓存 60s TTL）+ MySQL kv_store（每日免费对话计数、管理端 Token、deviceId 防伪）
- **支付**: 面包多
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

# 面包多（激活码）
MBAODU_APP_KEY=your_mbaodu_key

# 管理后台密码
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
# 编辑 .env.production，至少要填入 NEXT_PUBLIC_TCB_ENV_ID
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
│   │   ├── report/route.ts            # 维权方案报告（付费，服务端重算金额，落库历史）
│   │   ├── labor-reports/             # 维权报告历史列表/单条/删除
│   │   ├── scenarios/                 # 场景模板
│   │   ├── subscription/              # 订阅与激活
│   │   │   ├── admin/activate/       # 管理端激活码激活
│   │   │   ├── callback/              # 面包多回调
│   │   │   ├── mbaodu/activate/       # 激活设备
│   │   │   └── query-codes/           # 查询激活码
│   │   └── usage/                     # 额度查询（GET）
│   ├── components/
│   │   ├── CompensationForm.tsx       # 赔偿金计算器表单（客户端实时估算）
│   │   ├── HistoryPanel.tsx           # 历史记录面板
│   │   ├── ReportPanel.tsx            # 维权报告生成面板
│   │   ├── LaborHistoryPanel.tsx      # 维权报告历史抽屉
│   │   ├── ScenarioCard.tsx           # 场景卡片
│   │   ├── ScenarioModal.tsx          # 场景详情弹窗
│   │   └── SubscriptionActivate.tsx   # 激活组件
│   ├── labor/page.tsx                 # 劳动维权主页
│   └── page.tsx                       # 主页
├── lib/
│   ├── activation-security.ts         # 激活码防暴力破解
│   ├── compensation.ts               # 赔偿金计算纯函数（第40/47/87条，表格驱动测试）
│   ├── social-wage.ts                # 城市社平工资封顶表（带时效标注）
│   ├── db.ts                         # MySQL 连接池
│   ├── conversations.ts               # 对话历史 MySQL 持久化
│   ├── subscriptions.ts              # 订阅/激活码 MySQL + 内存缓存
│   ├── report-docx.ts                # 报告 markdown → .docx Blob + 下载触发
│   ├── labor-reports.ts              # 维权方案报告持久化（uid-scoped）
│   ├── usage-events.ts               # 使用事件追踪 + 场景统计
│   ├── mbaodu.ts                    # 面包多 API
│   ├── models.ts                    # 模型配置
│   ├── ratelimit.ts                 # 限流 + deviceId 防伪
│   ├── ttl-map.ts                   # 进程内 TTL 存储（限流/防爆破/订阅读缓存）
│   ├── kv.ts                        # MySQL kv_store（无 MySQL 时自动降级内存）
│   ├── chat-quota.ts                # 对话额度决策纯函数（表格驱动测试）
│   ├── free-count.ts                # 每日免费对话计数（kv_store 持久化，按 uid）
│   ├── admin-security.ts            # 管理端 Token + 登录防爆破
│   ├── scenarios.ts                 # 场景数据
│   ├── storage.ts                 # LocalStorage（客户端缓存）
│   └── subscription.ts             # 订阅逻辑（入口）
├── test/
│   ├── chat-quota.test.ts             # 对话额度决策表格驱动测试
│   ├── compensation.test.ts           # 赔偿金计算表格驱动测试
│   ├── report-prompt.test.ts          # 报告 prompt 断言测试
│   ├── report-docx.test.ts            # 报告 markdown→.docx 转换测试
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
| MBAODU_APP_KEY | 是 | - | 面包多 Key |
| ADMIN_UIDS | 否 | - | 允许的管理端登录的用户uid |
| MYSQL_HOST | 生产 | localhost | MySQL 主机 |
| MYSQL_PORT | 生产 | 3306 | MySQL 端口 |
| MYSQL_USER | 生产 | - | MySQL 用户名 |
| MYSQL_PASSWORD | 生产 | - | MySQL 密码 |
| MYSQL_DATABASE | 生产 | - | MySQL 数据库名 |
| MYSQL_USE_SSL | 否 | false | MySQL SSL 连接 |
| CHAT_FREE_PER_DAY | 否 | 10 | 每日免费对话次数 |