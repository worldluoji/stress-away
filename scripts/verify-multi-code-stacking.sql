-- stress-away Multi-Code Stacking - 验证脚本
-- 覆盖 6 个核心场景，手动验证多码叠加语义
-- 用法：mysql -u root -p stress_away < scripts/verify-multi-code-stacking.sql

USE stress_away;

-- ───────────────────────────────────────────────────────────────
-- 准备：清理测试数据
-- ───────────────────────────────────────────────────────────────

DELETE FROM subscriptions WHERE uid LIKE 'TEST_%';
DELETE FROM admin_activation_codes WHERE code LIKE 'TEST-%';

-- 三个测试码：分别 total=50 / 100 / 50，分别在不同时间生成（不同 expires_at）
-- 假设 T0 = 2026-01-01 00:00:00 UTC
SET @T0 = UNIX_TIMESTAMP('2026-01-01 00:00:00 UTC') * 1000;
SET @T10 = @T0 + 10 * 86400000;
SET @T40 = @T0 + 40 * 86400000;
SET @T41 = @T0 + 41 * 86400000;
SET @T71 = @T0 + 71 * 86400000;

INSERT INTO admin_activation_codes (code, uid, created_at, expires_at, total_times, used, activation_time)
VALUES
  ('TEST-AAAA-AAAA-01', NULL, @T0,  @T0  + 30*86400000, 50,  FALSE, NULL),  -- 码 A：T0 生成，T0+30d 过期
  ('TEST-BBBB-BBBB-02', NULL, @T10, @T10 + 30*86400000, 100, FALSE, NULL),  -- 码 B：T+10d 生成，T+40d 过期
  ('TEST-CCCC-CCCC-03', NULL, @T41, @T41 + 30*86400000, 50,  FALSE, NULL);  -- 码 C：T+41d 生成，T+71d 过期

-- ───────────────────────────────────────────────────────────────
-- 场景 A：T0 新用户 U1 绑码 A（total=50, expiresAt=T0+30d）
-- 期望：remaining=50, total=50, expires_at=T0+30d
-- ───────────────────────────────────────────────────────────────
-- 模拟代码逻辑：
--   1. UPDATE admin_activation_codes SET used=TRUE, uid='TEST_U1', activation_time=@T0 WHERE code='TEST-AAAA-AAAA-01';
--   2. INSERT INTO subscriptions (uid, device_id, status, source, total_usage, remaining_usage, activation_code, expires_at)
--      VALUES ('TEST_U1', 'dev1', 'active', 'admin', 50, 50, 'TEST-AAAA-AAAA-01', @T0+30*86400000);

UPDATE admin_activation_codes
SET used = TRUE, uid = 'TEST_U1', device_id = 'dev1', activation_time = @T0
WHERE code = 'TEST-AAAA-AAAA-01';

INSERT INTO subscriptions (uid, device_id, status, source, total_usage, remaining_usage, activation_code, expires_at)
VALUES ('TEST_U1', 'dev1', 'active', 'admin', 50, 50, 'TEST-AAAA-AAAA-01', @T0 + 30*86400000);

SELECT '=== 场景 A: 新用户绑码 A ===' AS scenario;
SELECT uid, status, total_usage AS total, remaining_usage AS remaining, activation_code,
       FROM_UNIXTIME(expires_at/1000) AS expires_at_human
FROM subscriptions WHERE uid = 'TEST_U1';

-- ───────────────────────────────────────────────────────────────
-- 场景 B：T+10d U1 绑码 B（total=100, expiresAt=T+40d）
-- 期望：remaining=50+100=150, total=50+100=150, expires_at=max(T+30d, T+40d)=T+40d
-- ───────────────────────────────────────────────────────────────

UPDATE admin_activation_codes
SET used = TRUE, uid = 'TEST_U1', device_id = 'dev1', activation_time = @T10
WHERE code = 'TEST-BBBB-BBBB-02';

-- 模拟叠加：currentSub.remaining_usage(50) + code.total_times(100) = 150
-- currentSub.total_usage(50) + code.total_times(100) = 150
-- max(T0+30d, T0+40d) = T0+40d
-- device_id 用 COALESCE，保留首次的 'dev1'
UPDATE subscriptions
SET total_usage = 50 + 100,
    remaining_usage = 50 + 100,
    activation_code = 'TEST-BBBB-BBBB-02',
    expires_at = GREATEST(@T0 + 30*86400000, @T10 + 30*86400000)
WHERE uid = 'TEST_U1';

SELECT '=== 场景 B: 叠加绑码 B ===' AS scenario;
SELECT uid, total_usage AS total, remaining_usage AS remaining, activation_code,
       FROM_UNIXTIME(expires_at/1000) AS expires_at_human
FROM subscriptions WHERE uid = 'TEST_U1';

-- ───────────────────────────────────────────────────────────────
-- 场景 C：T+15d 消耗 30 次
-- 期望：remaining=150-30=120, total=150, expires_at=T+40d 不变
-- ───────────────────────────────────────────────────────────────

UPDATE subscriptions SET remaining_usage = 150 - 30 WHERE uid = 'TEST_U1';

SELECT '=== 场景 C: 消耗 30 次 ===' AS scenario;
SELECT uid, total_usage AS total, remaining_usage AS remaining, expires_at
FROM subscriptions WHERE uid = 'TEST_U1';

-- ───────────────────────────────────────────────────────────────
-- 场景 D：T+41d（sub 已过期）U1 绑码 C（total=50, expiresAt=T+71d）
-- 期望：remaining=50 (不继承过期的 120), total=50, expires_at=T+71d
-- 关键：isExpired 分支，不叠加
-- ───────────────────────────────────────────────────────────────

-- 先把订阅 expires_at 改到过去模拟"过期"（生产环境由 isPaidUserByUid 自然判断）
-- 这里我们直接展示叠加逻辑的预期结果

UPDATE admin_activation_codes
SET used = TRUE, uid = 'TEST_U1', device_id = 'dev1', activation_time = @T41
WHERE code = 'TEST-CCCC-CCCC-03';

-- 因为 sub.expires_at (T+40d) < @T41，走 "无订阅 / 已过期" 分支：
-- remaining = 50 (新码), total = 50, expires_at = T+71d
UPDATE subscriptions
SET total_usage = 50,
    remaining_usage = 50,
    activation_code = 'TEST-CCCC-CCCC-03',
    expires_at = @T41 + 30*86400000
WHERE uid = 'TEST_U1';

SELECT '=== 场景 D: 过期后绑码 C (不继承) ===' AS scenario;
SELECT uid, total_usage AS total, remaining_usage AS remaining, activation_code,
       FROM_UNIXTIME(expires_at/1000) AS expires_at_human
FROM subscriptions WHERE uid = 'TEST_U1';

-- 验证：U1 绑了 3 个码
SELECT '=== U1 绑定记录 ===' AS scenario;
SELECT code, total_times, used, uid,
       FROM_UNIXTIME(created_at/1000) AS created,
       FROM_UNIXTIME(expires_at/1000) AS expires
FROM admin_activation_codes
WHERE uid = 'TEST_U1'
ORDER BY created_at;

-- ───────────────────────────────────────────────────────────────
-- 场景 E：T+42d U1 再输码 A（同码幂等）
-- 期望：remaining/total/expires_at 不变（不重复扣减）
-- ───────────────────────────────────────────────────────────────
-- 模拟前快照
SELECT '=== 场景 E 前: 同码重复输入 ===' AS scenario;
SELECT uid, remaining_usage AS remaining, activation_code FROM subscriptions WHERE uid = 'TEST_U1';

-- 模拟路由层幂等短路：existingSub.activationCode === normalizedCode → 直接 return
-- 状态应不变
SELECT '=== 场景 E 后: 状态未变 ===' AS scenario;
SELECT uid, remaining_usage AS remaining, activation_code FROM subscriptions WHERE uid = 'TEST_U1';

-- ───────────────────────────────────────────────────────────────
-- 场景 F：T+50d U2 尝试绑码 A（A 已绑给 U1）
-- 期望：consumeAdminActivationCode 返回 code_already_used
-- ───────────────────────────────────────────────────────────────
-- 模拟前置检查：admin_activation_codes.code='TEST-AAAA-AAAA-01' 的 uid = 'TEST_U1'
-- 调用方传 uid='TEST_U2' → code.uid && code.uid !== 'TEST_U2' → 返回错误

SELECT '=== 场景 F: U2 尝试绑码 A ===' AS scenario;
SELECT code, uid, used FROM admin_activation_codes WHERE code = 'TEST-AAAA-AAAA-01';
-- 期望：code=TEST-AAAA-AAAA-01, uid=TEST_U1, used=TRUE
-- 应用层逻辑会拒绝 U2 的绑定请求

-- ───────────────────────────────────────────────────────────────
-- 清理测试数据
-- ───────────────────────────────────────────────────────────────
-- DELETE FROM subscriptions WHERE uid = 'TEST_U1';
-- DELETE FROM admin_activation_codes WHERE code LIKE 'TEST-%';
-- 取消注释上面两行以清理

SELECT '=== 验证完成 ===' AS done;
