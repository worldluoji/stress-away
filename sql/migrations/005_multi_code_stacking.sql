-- stress-away Multi-Code Stacking - Migration 005
-- 语义变更：
--   1) 一个 uid 可以绑定多个 admin_activation_codes 行
--   2) subscriptions.expires_at = MAX(所有绑定码的 expires_at)
--   3) subscriptions.remaining_usage = 叠加后的剩余次数
--   4) subscriptions.activation_code = 最近一次绑定的码（不代表唯一）

USE stress_away;

-- ───────────────────────────────────────────────────────────────
-- 1. 文档化列语义（不破坏表结构）
-- ───────────────────────────────────────────────────────────────

ALTER TABLE subscriptions
  MODIFY COLUMN activation_code VARCHAR(32)
    COMMENT '最近一次绑定的管理端激活码（叠加模式下不代表唯一码）';

ALTER TABLE subscriptions
  MODIFY COLUMN expires_at BIGINT
    COMMENT '订阅到期时间 = MAX(所有绑定 admin_activation_codes.expires_at)';

-- ───────────────────────────────────────────────────────────────
-- 2. 复合索引：管理后台按 uid 查询某用户所有绑定记录
-- 替换原单列 idx_uid 索引
-- ───────────────────────────────────────────────────────────────

ALTER TABLE admin_activation_codes
  DROP INDEX idx_uid,
  ADD INDEX idx_uid_used (uid, used);
