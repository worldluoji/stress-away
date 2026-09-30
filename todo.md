# TODO — 劳动维权转型上线清单

> 2026-09-30 转型 MVP 代码已完成（22 测试全绿、build 成功、lint 无新增错误）。以下为上线前/上线后待办。

## 上线前（阻塞项）

- [ ] **核对社平工资数据**：`lib/social-wage.ts` 中 15 个城市封顶基数为近似值，逐城市对照当地人社局最新公布的"全口径城镇单位就业人员月平均工资"核实，并更新 `SOCIAL_WAGE_DATA_AS_OF`
- [ ] **部署环境端到端验证**（本地无 Redis/MySQL，`/api/report` 与 `/api/chat` 本地均 500，属既有行为）：
  - [ ] 匿名访问 /labor，填表实时算出金额
  - [ ] 免费登录用户请求报告 → 预期 403 `paid_only`
  - [ ] 绑定激活码后生成报告 → 五段式内容完整、金额与服务端计算一致
  - [ ] AI 调用失败时不扣额度
- [ ] **浏览器中人工走查 /labor UI**（本次仅验证了路由编译与 build，未做点击测试）：表单交互、结果卡片、报告 Markdown 渲染、激活/登录弹窗
- [ ] **提交代码**：按 Conventional Commits 序列
  `chore: add vitest` → `test: compensation specs` → `feat: calculator + social wage` → `feat: report prompt & callModel refactor` → `feat: /api/report` → `feat: labor page & homepage` → `docs: sync`

## 上线后（数据与运营）

- [ ] 查生产 `scenario_stats`（/api/stats）：确认 `resignation-negotiation` 在 12 场景中的历史流量排名，验证选题信号
- [ ] 观察 `labor-report` 事件计数与免费计算器使用量 → 报告请求转化率
- [ ] 面包多/闲鱼 SKU 上架：¥9.9/1 次、¥29.9/5 次（管理后台生成对应次数的激活码）
- [ ] 小红书/抖音内容测试：以"算赔偿结果卡片"为素材投放，验证免费钩子的获客能力
- [ ] 收集首批报告用户的 👍/👎 与投诉，迭代报告 prompt（`REPORT_SYSTEM_PROMPT`）

## 后续迭代（非阻塞，验证付费成立后再做）

- [ ] 计算器结果分享卡片（复用 `ShareCard.tsx`）
- [ ] 报告持久化/历史（复用 conversations 机制）
- [ ] 扩充社平工资城市覆盖
- [ ] 若付费验证成立：考虑 B 端/律师导流
