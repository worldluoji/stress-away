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
- [ ] 报告持久化/历史：当前 reply 只活在客户端 React state，刷新即丢；服务端 `/api/report` 仅 `consumeUsageByUid` + `incrementChatCount("labor-report")`，不存内容。实施：`lib/conversations.ts` 加 `kind: 'chat' | 'report'` 分桶复用现有持久化层；新建 `/api/reports` 列表接口 + history 抽屉新增"报告"tab；点击历史条目可重新加载并复用 docx 下载。**触发条件：付费转化率验证通过后**（避免给未验证有用的功能堆第二套持久化层）
- [ ] 扩充社平工资城市覆盖到 30+ 城（含省会/计划单列市/主要地级市），同步扩 `lib/cities.ts` 省份映射
- [ ] 若付费验证成立：考虑 B 端/律师导流
