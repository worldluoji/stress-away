# TODO — 劳动维权转型上线清单

> 2026-09-30 转型 MVP 代码已完成（22 测试全绿、build 成功、lint 无新增错误）。
> 2026-10-02 社平工资表结构重构（PR #1）已完成，测试扩充到 92 项全绿。
> 2026-10-02 Form UX 补齐（PR #2）已完成：城市输入下方说明、新增「自定义社平工资」高级选项、结果卡按 source 分支展示来源 label/date/URL。
> 2026-10-02 报告功能增强（PR #3）已完成：复制全文（剪贴板 raw markdown）+ 下载 Word（.docx，docx@9.x）+ 付费次数二次确认（402 `report_quota_confirm`，前端 `window.confirm`），测试 92 → 103 项全绿。下方为剩余待办。

## 上线前（阻塞项）

- [ ] **逐城核对社平工资数据**：`lib/social-wage.ts` 中 17 个城市（15 + 重庆 + 济南）封顶基数为近似值，逐城市对照当地人社局最新公布的"全口径城镇单位就业人员月平均工资"核实，更新 wage / sourceUrl / effectiveDate；`SOCIAL_WAGE_DATA_AS_OF` 同步更新
- [ ] **部署环境端到端验证**（本地无 Redis/MySQL，`/api/report` 与 `/api/chat` 本地均 500，属既有行为）：
  - [ ] 匿名访问 /labor，填表实时算出金额
  - [ ] 免费登录用户请求报告 → 预期 403 `paid_only`
  - [ ] 绑定激活码后生成报告 → 五段式内容完整、金额与服务端计算一致
  - [ ] 付费用户点生成按钮 → 弹 `window.confirm`「本次生成将消耗 1 次报告额度（剩余 X 次）」（PR #3 新增）
  - [ ] 点取消 → 无后续请求，额度不变
  - [ ] 点确认 → 报告渲染，顶部额度徽标 −1
  - [ ] 复制全文 → 剪贴板含 raw markdown（`##`、`**` 保留），按钮 2s 变"已复制"
  - [ ] 下载 Word → `维权方案报告_YYYY-MM-DD.docx`，Word/WPS 打开 ## 渲染为标题
  - [ ] AI 调用失败时不扣额度
- [ ] **浏览器中人工走查 /labor UI**（PR #2 新增：4 种 city 路径下结果卡显示正确——北京走 city + 人社局链接、温州走 province 代理杭州 + 警告含「浙江省」、用户输入 15000 走 user、未收录城市走 uncovered 提示自行核实）
- [ ] **提交代码**：按 Conventional Commits 序列
  `chore: add vitest` → `test: compensation specs` → `feat: calculator + social wage` → `feat: report prompt & callModel refactor` → `feat: /api/report` → `feat: labor page & homepage` → `docs: sync` → `refactor(social-wage): 三级查表链 + 来源元数据` → `feat(social-wage): 表单高级选项 + 结果卡来源感知渲染` → `feat(report): docx 下载 + 全文复制 + 付费次数二次确认`

## 上线后（数据与运营）

- [ ] 查生产 `scenario_stats`（/api/stats）：确认 `resignation-negotiation` 在 12 场景中的历史流量排名，验证选题信号
- [ ] 观察 `labor-report` 事件计数与免费计算器使用量 → 报告请求转化率
- [ ] 面包多/闲鱼 SKU 上架：¥9.9/1 次、¥29.9/5 次（管理后台生成对应次数的激活码）
- [ ] 小红书/抖音内容测试：以"算赔偿结果卡片"为素材投放，验证免费钩子的获客能力
- [ ] 收集首批报告用户的 👍/👎 与投诉，迭代报告 prompt（`REPORT_SYSTEM_PROMPT`）

## 后续迭代（非阻塞，验证付费成立后再做）

- [ ] 计算器结果分享卡片（复用 `ShareCard.tsx`）
- [x] 报告持久化/历史（PR #4）：新表 `labor_reports`（uid + comp_json + computation_json + reply + created_at，索引 `uid+created_at`）；`lib/labor-reports.ts` CRUD；`GET /api/labor-reports` 列表 + `GET/DELETE /api/labor-reports/[id]` 单条（uid-scoped 防越权）；`/api/report` 在 AI 成功 + consumeUsageByUid 后追加 `saveLaborReport`（失败不阻塞）；`/labor` 头部加时钟按钮 → 抽屉展示历史，点击行展开全文 + 复用复制/下载 Word
- [ ] **PR #5 — 报告代码检视修复（f14d99b + 6853a35 检视）**：
  - 🔴 **报告 id 熵提升**：`r_${Date.now().toString(36)}${Math.random().toString(36).slice(2,8)}` 仅 7 字符 `Math.random()`，同秒并发有碰撞风险 → PK 冲突 500；改 `crypto.randomUUID()` 或扩到 12 字符（`lib/labor-reports.ts:59-81` + `app/api/report/route.ts:253`）
  - 🔴 **`saveLaborReport` ON DUPLICATE KEY 是死代码**：id 永远新生成，分支不触发；改为纯 `INSERT` 简化语义（`lib/labor-reports.ts:62-70`）
  - 🔴 **第二步生成前重检额度**：`ReportPanel` 第二步不再查 quota，但 admin 撤销/并发场景下用户会看到 AI 成功 + 扣额度失败；r2 前再 `getRemainingUsageByUid` 一次（`ReportPanel.tsx:110` + `app/api/report/route.ts:236`）
  - 🔴 **落库失败应告知用户**：AI 成功 + 扣额度后 `saveLaborReport` 静默吞错，用户刷新找不到历史会怀疑系统；响应加 `warning` 字段或前端 toast（`app/api/report/route.ts:250-266`）
  - 🟡 **`/api/labor-reports` 错误响应不一致**：列表端点错误时返回 `{reports: []}` 200；改为 500 或至少加 `error` 字段（`app/api/labor-reports/route.ts:14-15`）
  - 🟡 **`ReportPanel` r2 = 402 误导**：第二步理论上不该 402，但 race condition 仍可能；r2.status === 402 时直接报错不弹 confirm（`ReportPanel.tsx:103-120`）
  - 🟡 **历史抽屉并发下载状态**：`downloadingId` 单值，并发点两个下载会互相覆盖；改 `Set<string>` 或接受现状（`LaborHistoryPanel.tsx:40, 62-70`）
  - 🟢 **历史 narrative 截断按词**：`slice(0, 30)` 中文截字可能断词；改 `Intl.Segmenter('zh')`（`LaborHistoryPanel.tsx:113`）
  - 🟢 **历史金额可能与算法升级不同步**：落库时记 `schemaVersion`，旧报告渲染时标注（`LaborHistoryPanel.tsx:110` + DB 加列）
  - 🟢 **删除报告无 undo**：`LaborHistoryPanel` 点 `x` 即删，建议加 `window.confirm` 或 toast undo
  - 🟢 **历史 LIMIT 50 静默丢失旧记录**：超过 50 条无声丢弃，加翻页或扩 LIMIT + 前端分页（`lib/labor-reports.ts:49`）
- [ ] **PR #6 — settle_failed UX 优化 + ErrorBanner tone 扩展**：
  - 🟡 **`settle_failed` 用 ErrorBanner 红色显示易误导**：报告内容正确但顶部红色"次数扣除异常请联系客服"会让用户误以为报告出错；建议给 ErrorBanner 加 `tone="warning"` 变体（黄色 + warning icon），settle_failed 时用 warning 风格而非 error 风格（`ReportPanel.tsx:117-120, 135-138`）
- [ ] 扩充社平工资城市覆盖到 30+ 城（含省会/计划单列市/主要地级市），同步扩 `lib/cities.ts` 省份映射
- [ ] 若付费验证成立：考虑 B 端/律师导流
