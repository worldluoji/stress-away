# 安全问题修复记录

> 本文件记录项目安全审计发现的问题及修复状态，供后续跟踪参考。

## 修复总览

| # | 优先级 | 问题 | 状态 | 修复文件 |
|---|--------|------|------|----------|
| 1 | 高 | 支付回调无签名验证 | ✅ 已禁用 | `app/api/subscription/callback/route.ts` |
| 2 | 高 | Admin cookie 用密码当 token | ✅ 已修复 | `app/api/admin/login/route.ts`, `lib/redis.ts` |
| 3 | 高 | Admin 登录无暴力破解保护 | ✅ 已修复 | `app/api/admin/login/route.ts`, `lib/redis.ts` |
| 4 | 高 | AI 调用前未检查用额 | ✅ 已修复 | `app/api/chat/route.ts` |
| 5 | 高 | ReactMarkdown XSS（潜在） | ✅ 已修复 | `lib/sanitize.ts`, `app/page.tsx` |
| 6 | 中 | 设备 ID 可伪造 | ✅ 已修复 | `lib/ratelimit.ts`, 涉及所有 API 路由 |
| 7 | 中 | 本地存储数据可被篡改 | ⏭ 接受现状 | — |
| 8 | 中 | 查询激活码无权限验证 | ⏭ 接受现状 | 有 48h 查询窗口保护 |
| 9 | 中 | TCB session cookie 签名长度 DoS | ✅ 已修复 | `lib/auth.ts` |
| 10 | 中 | 激活码暴力破解防御弱（Redis 模式） | ✅ 已修复 | `lib/activation-security.ts`, `lib/redis.ts` |
| 11 | 中 | 订单认领竞态条件 | ✅ 已修复 | `app/api/orders/claim/route.ts` |
| 12 | 低 | X-Forwarded-For 可伪造 | ⏭ 跳过 | 有云服务层限速防护 |
| 13 | 低 | 错误信息泄露 | ✅ 已修复 | `app/api/subscription/query-codes/route.ts` |

## 修复详情

### 问题 1: 支付回调无签名验证 [高]
- **描述**: `/api/subscription/callback` 无来源验证，任何人知道订单号即可伪造支付成功回调
- **修复**: 整个文件注释禁用，保留代码以备将来需要时启用签名验证
- **日期**: 2026-05-23

### 问题 2: Admin Cookie 用密码当 Token [高]
- **描述**: `admin_token` cookie 直接存明文密码，泄露后可直接重放
- **修复**: 登录成功后生成 32 字节随机 token（64 字符 hex），存 Redis 并设 2 小时 TTL；cookie 中存随机 token 而非密码
- **涉及文件**:
  - `lib/redis.ts`: 新增 `setAdminToken` 函数
  - `app/api/admin/login/route.ts`: 登录成功后调用 `setAdminToken` 生成随机 token
  - `app/api/admin/orders/[orderId]/route.ts`: 验证时查 Redis 确认 token 存在
- **日期**: 2026-05-23

### 问题 3: Admin 登录无暴力破解保护 [高]
- **描述**: 管理员登录接口无失败次数限制，攻击者可穷举密码
- **修复**: IP 维度计数，5 次失败后封锁 15 分钟，成功即清零
- **涉及文件**:
  - `lib/redis.ts`: 新增 `checkAdminBlocked`、`recordAdminFailedAttempt`、`resetAdminFailedAttempts`
  - `app/api/admin/login/route.ts`: 登录前后调用上述函数
- **日期**: 2026-05-23

### 问题 4: 设备 ID 可伪造 [中]
- **描述**: 前端用 FingerprintJS 生成 deviceId 传入后端，后端直接信任，无验证
- **修复**: Redis set 记录每个 IP 用过的所有 deviceId（TTL 1 小时），新 deviceId 超过 5 个则拒绝请求
- **涉及文件**:
  - `lib/ratelimit.ts`: 新增 `checkDeviceIdSpoofing` 函数
  - `app/api/chat/route.ts`: 调用 `checkDeviceIdSpoofing`
  - `app/api/usage/route.ts`: 调用 `checkDeviceIdSpoofing`
  - `app/api/usage/consume/route.ts`: 调用 `checkDeviceIdSpoofing`
  - `app/api/subscription/mbaodu/activate/route.ts`: 调用 `checkDeviceIdSpoofing`
  - `app/api/subscription/query-codes/route.ts`: 调用 `checkDeviceIdSpoofing`
- **日期**: 2026-05-24

### 问题 5: 本地存储数据可被篡改 [中]
- **描述**: `USE_LOCAL_STORAGE=true` 时订阅状态、剩余次数存在 localStorage，用户可随意修改
- **状态**: 接受现状。本地模式标注为"开发测试专用"，生产环境强制 Redis
- **日期**: 2026-05-24

### 问题 6: 查询激活码无权限验证 [中]
- **描述**: 任何知道订单号的人都能查激活码（掩码版），无法验证查询者和订单的关联
- **状态**: 接受现状。面包多下单时无法传 deviceId，无法在购买时绑定设备。但已有 48 小时查询窗口限制，实际风险有限
- **日期**: 2026-05-24

### 问题 7: X-Forwarded-For 可伪造 [低]
- **描述**: IP 限流从 `X-Forwarded-For` header 获取，可被伪造绕过
- **状态**: 接受现状。有云服务层（Vercel/Cloudflare 等）限速防护
- **日期**: 2026-05-24

### 问题 4: AI 调用前未检查用额 [高]
- **描述**: `/api/chat` 先调用 AI 再 consumeOne，若 consumeOne 失败用户可无限使用
- **修复**: consumeOne 移到 AI 调用之前，失败直接返回 503，不给免费 AI 访问
- **涉及文件**: `app/api/chat/route.ts`
- **日期**: 2026-06-05

### 问题 5: ReactMarkdown XSS（潜在）[高]
- **描述**: AI 回复存储时 sanitizeMarkdown 会把 `<` 转成 `&lt;`，破坏 markdown；ReactMarkdown 默认支持 raw HTML
- **修复**: (1) sanitizeMarkdown 去掉破坏性的 `<` 转义，改为只移除危险标签和属性；(2) ReactMarkdown 加 `disallowedElements` 阻止所有 HTML 标签渲染
- **涉及文件**: `lib/sanitize.ts`, `app/page.tsx`
- **日期**: 2026-06-05

### 问题 9: TCB session cookie 签名长度 DoS [中]
- **描述**: `timingSafeEqual` 两边 Buffer 长度不同会抛异常，恶意 cookie 可导致认证失败（DoS）
- **修复**: 比较前先检查 `sigBuf.length !== expectedBuf.length`，不匹配直接 return null
- **涉及文件**: `lib/auth.ts`
- **日期**: 2026-06-05

### 问题 10: 激活码暴力破解防御弱（Redis 模式）[中]
- **描述**: Redis 模式下 `checkActivationBlocked` 直接返回 `{blocked: false}`，形同虚设
- **修复**: 新增 `checkActivationBlockedRedis`、`recordActivationFailedAttemptRedis`、`resetActivationFailedAttemptsRedis` 函数；`lib/activation-security.ts` 加 async 版本，admin activate 路由改用 async
- **涉及文件**: `lib/redis.ts`, `lib/activation-security.ts`, `app/api/subscription/admin/activate/route.ts`
- **日期**: 2026-06-05

### 问题 11: 订单认领竞态条件 [中]
- **描述**: 先 SELECT 检查再 INSERT，两个人同时提交同一订单可能都通过检查
- **修复**: 用 `SELECT ... FOR UPDATE` 加事务锁，INSERT/UPDATE 在同一事务内完成
- **涉及文件**: `app/api/orders/claim/route.ts`, `lib/db.ts`（新增 `getConnection`）
- **日期**: 2026-06-05

### 问题 8: 错误信息泄露 [低]
- **描述**: `query-codes` 接口的 catch 块把原始错误信息（面包多 API 错误）返回给前端
- **修复**: 统一返回 `{ error: "service_error", message: "系统正忙，请稍后再试（{logId}）" }`，原始错误仅写服务端日志
- **涉及文件**: `app/api/subscription/query-codes/route.ts`
- **日期**: 2026-05-24

## 相关函数索引

### lib/redis.ts
- `setAdminToken(rawToken)` — 生成并存储 admin token
- `validateAdminToken(rawToken, passwordHash)` — 验证 admin token（未使用，目前用 Redis key existence check）
- `checkAdminBlocked(ip)` — 检查 IP 是否被封
- `recordAdminFailedAttempt(ip)` — 记录失败次数
- `resetAdminFailedAttempts(ip)` — 清零失败计数

### lib/ratelimit.ts
- `checkDeviceIdSpoofing(ip, deviceId)` — 检测同一 IP 是否使用大量不同 deviceId
- `RATE_LIMITS` — 限流配置（含新清理的 `callback` 记录）