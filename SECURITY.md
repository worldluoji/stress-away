# 安全问题修复记录

> 本文件记录项目安全审计发现的问题及修复状态，供后续跟踪参考。

## 修复总览

| # | 优先级 | 问题 | 状态 | 修复文件 |
|---|--------|------|------|----------|
| 1 | 高 | 支付回调无签名验证 | ✅ 已禁用 | `app/api/subscription/callback/route.ts` |
| 2 | 高 | Admin cookie 用密码当 token | ✅ 已修复 | `app/api/admin/login/route.ts`, `lib/redis.ts` |
| 3 | 高 | Admin 登录无暴力破解保护 | ✅ 已修复 | `app/api/admin/login/route.ts`, `lib/redis.ts` |
| 4 | 中 | 设备 ID 可伪造 | ✅ 已修复 | `lib/ratelimit.ts`, 涉及所有 API 路由 |
| 5 | 中 | 本地存储数据可被篡改 | ⏭ 跳过 | — |
| 6 | 中 | 查询激活码无权限验证 | ⏭ 接受现状 | 有 48h 查询窗口保护 |
| 7 | 低 | X-Forwarded-For 可伪造 | ⏭ 跳过 | 有云服务层限速防护 |
| 8 | 低 | 错误信息泄露 | ✅ 已修复 | `app/api/subscription/query-codes/route.ts` |

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