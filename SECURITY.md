# 安全设计说明

> 本项目为开源演示项目。以下记录当前代码中的安全设计与已接受的权衡，供阅读代码时参考。

## 账号与会话

| 措施 | 实现 |
|---|---|
| 密码存储 | scrypt 哈希（16 字节随机盐，keylen 64），格式 `v1:<salt-hex>:<scrypt-hex>`，见 `lib/user-auth.ts` |
| 防用户名枚举 | 用户不存在时也对 `DUMMY_PASSWORD_HASH` 跑完整 scrypt；登录失败响应同形，禁用状态在**密码验证通过后**才返回 |
| 防爆破 | 按用户名（大小写归一）15 分钟窗口内连续失败 5 次锁定 15 分钟，见 `lib/login-rate-limit.ts` |
| 会话 | token = `randomBytes(32)`，库中只存 SHA-256；Cookie `session` 为 httpOnly / sameSite=lax / 生产 secure / 7 天，见 `lib/user-auth.ts` |
| 即时吊销 | 禁用账号、重置密码、登出均删除对应 sessions 行；`getCurrentUser` 查询带 `status = 'active'`，会话行残留也失效 |
| 身份来源 | `lib/api-auth.ts` 是所有业务路由的身份 chokepoint：uid / role **只**来自验签会话，客户端自报的 `x-user-id` 头已不被信任 |

## 资源与数据保护

| 措施 | 实现 |
|---|---|
| 限流 | 设备 ID + IP 双维度；`/api/chat` 20 次/分、`/api/report` 5 次/分（402 探测不占额度）、`/api/events`、`/api/usage` 30 次/分，见 `lib/ratelimit.ts` |
| 设备 ID 防伪 | 同 IP 短时内出现大量不同 deviceId 则拒绝，见 `checkDeviceIdSpoofing` |
| 输入校验 | 用户消息 ≤600 字（前后端双校验），报告 narrative ≤600 字、基本情况回答 ≤200 字，日期/枚举严格校验 |
| XSS 防御 | `sanitizeMarkdown` 清洗 AI 输出；三处 Markdown 渲染统一使用 `disallowedElements` 禁用 script/style/iframe/form 等元素，见 `app/components/markdown.tsx` |
| 防金额篡改 | 报告金额由服务端 `computeCompensation` 重算后注入 prompt，不信任前端传来的数值 |
| 越权防护 | 报告历史与单条删除按 uid-scoped 查询；管理端路由由 `requireAdmin()` 守卫 |
| 事务一致性 | 额度扣减 `SELECT … FOR UPDATE`；硬删除在单一事务内级联清理内容数据；扣量失败与落库失败分别处理并显式告知用户 |

## 已接受的权衡

- **进程内内存计数**：限流、登录防爆破、额度读缓存放在进程内存，重启失效、多实例各自独立。本演示项目无 Redis，靠 scrypt 慢哈希与部署者发放账号兜底
- **无 MySQL 降级**：KV 计数自动降级到内存；报告历史保存返回 `skipped` 并在响应中提示；漏斗统计降级为 0/null。这些降级都是为了本地零依赖可运行
- **LocalStorage 模式**：`USE_LOCAL_STORAGE=true` 仅用于开发测试，客户端数据可被用户自行修改，不作为生产安全边界

## 历史说明

早期的部分安全审计记录已随架构演进不再适用，完整脉络见 git 历史；当前实现以本文为准。
