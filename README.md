# 反PUA手册 · Stress-Away

> 开源作品集项目（2026-11 起）。面向大城市高压青年的职场维权与应对助手。**仅供学习与演示，不构成法律意见。**

免费估算裁员赔偿（N+1 / 2N / 代通知金 / 加班费 / 未休年假折算），生成劳动维权方案参考稿，并提供职场反PUA应对话术。

## 谁适合用

- 被裁员、欠薪、违法解除，想先弄清法定赔偿能拿多少的人
- 遇到职场 PUA、不合理对待，想要具体应对话术与心态建议的人
- 想参考证据清单、仲裁流程与申请书格式的人（正式提交前请咨询律师）

## 能用什么

### 1. 赔偿估算（`/labor`，打开即用）

- 免费、无需账号，填完工资与日期实时出结果
- 依据《劳动合同法》第 40 / 47 / 87 条：N+1、2N、代通知金、加班费（150% / 200% / 300%）、未休年假折算、高薪双封顶（3× 社平、12 年）
- 内置 30 个城市社平工资封顶基数，含来源链接与生效日期；未收录城市回退到省会或由用户自填，结果会标注数据来源

### 2. AI 反PUA话术（首页）

- 12 个常见职场困境模板，描述处境后生成四段式建议：话术反击 / 心态调整 / 行动建议 / 法律参考
- 支持场景细分追问、复制、收藏、点赞、分享卡片；对话历史最多 50 条

### 3. 维权方案报告（演示功能）

- 五段式参考稿：赔偿明细核对 / 证据清单 / 仲裁流程时间线 / 仲裁申请书草稿 / 风险与谈判策略
- 金额由服务端重算后注入，不采信前端传来的数字
- 可复制全文（raw markdown）、下载 Word（.docx）、保存到历史后随时找回
- 在部署者配置的演示环境中使用；额度由部署者设置。生成前会确认一次，AI 生成失败不扣额度

## 谁能用

| 功能 | 使用条件 |
|---|---|
| 赔偿估算 | 任何人，打开 `/labor` 即可，无需账号 |
| AI 反PUA话术 | 演示账号用户，每日有免费对话额度 |
| 维权方案报告 | 演示账号用户，按部署者配置的额度使用 |

## 技术栈

| 层次 | 选型 |
|---|---|
| 框架 | Next.js 16（App Router）+ React 19 + TypeScript |
| 样式 | Tailwind CSS 4 |
| AI | DeepSeek V4 Flash / MiniMax 2.7（环境变量切换） |
| 存储 | MySQL 8.0 + 进程内内存 + LocalStorage（客户端缓存） |
| Markdown | react-markdown + remark-gfm（GFM 表格） |
| 测试 | Vitest（表格驱动） |
| 部署 | Docker multi-stage，Next.js standalone，node:22-alpine |

## 工程实现（简要）

- 赔偿计算是纯函数，规则由 343 项表格驱动测试钉死（全绿）
- 报告金额服务端重算后注入 prompt，防止前端篡改；生成失败不扣额度
- MySQL 不可用时自动降级，报告历史、漏斗统计会给出明确提示而不是静默丢失
- Word 导出的 6 项 Mac Word 兼容性处理都有 XML 级回归断言

## 快速开始

```bash
pnpm install
cp .env.local.example .env.local   # 填入 AI API Key 与 MySQL 配置
pnpm dev                           # http://localhost:8989
pnpm test                          # 343 tests
pnpm lint
pnpm build
```

全新安装初始化数据库：

```bash
mysql -u root -p < sql/migrations/001_initial.sql
```

存量库按编号执行增量迁移（如 `002_add_users_status.sql`）。没有 MySQL 时应用仍可启动，但账号、历史与额度会降级或跳过，报告生成后的历史保存会给出提示。

赔偿估算打开 `/labor` 就能用；话术与报告需先在 `/admin` 创建演示账号并配置额度。详细 API 契约与数据结构见 [spec.md](./spec.md)。

## 部署

```bash
cp .env.local.example .env.production
docker build -t stress-away:latest .
docker run --rm -p 3000:3000 --env-file .env.production stress-away:latest
```

`NEXT_PUBLIC_*` 在构建阶段内联，其余变量运行时注入；Dockerfile 会在 runner 阶段删除 `.env.production`，避免敏感文件残留。

## 免责声明

本项目全部内容由 AI 生成，**仅供学习与参考，不构成律师意见或法律建议**。赔偿金额为估算，劳动维权结果以劳动仲裁委员会/法院认定为准。提交任何文书或作出决策前，请咨询具备执业资质的律师。

## License

[MIT](./LICENSE) © 2026 worldluoji
