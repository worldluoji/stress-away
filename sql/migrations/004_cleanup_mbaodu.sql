-- stress-away MySQL Migration 004
-- 清理面包多遗留：删除 orders / activation_codes 表，清理 subscriptions 废弃列

USE stress_away;

-- ───────────────────────────────────────────────────────────────
-- 1. 删除面包多相关表
-- ───────────────────────────────────────────────────────────────

-- orders: 面包多订单认领表（订单号→支付状态→认领状态），已迁移到 uid 体系后不再需要
DROP TABLE IF EXISTS orders;

-- activation_codes: 面包多订单激活码表（每个订单两个码），已废弃，改为纯 admin 激活码
DROP TABLE IF EXISTS activation_codes;

-- ───────────────────────────────────────────────────────────────
-- 2. 清理 subscriptions 表废弃列
--
-- order_id: 面包多订单号，已废弃
-- 注意: source 字段仍保留 ENUM('admin')，保留旧数据兼容性
--       （旧数据 source='mbaodu' 保持不变，仅代码侧不再写入 'mbaodu'）
-- ───────────────────────────────────────────────────────────────

ALTER TABLE subscriptions
  DROP COLUMN IF EXISTS order_id;
