-- stress-away TCB User Integration - Migration 002
-- Run this after 001_initial.sql

USE stress_away;

-- ==================== Subscriptions (uid-based, replaces device-based) ====================
-- uid PRIMARY KEY: TCB user ID
-- device_id nullable: for backward compatibility with old device-only users
-- total_usage: always 100 (one order claim = 100 times)
-- remaining_usage: remaining times, starts at 100

CREATE TABLE IF NOT EXISTS subscriptions_new (
  uid VARCHAR(64) PRIMARY KEY,
  device_id VARCHAR(64),                    -- current device, nullable
  status ENUM('active', 'inactive') NOT NULL DEFAULT 'inactive',
  source ENUM('mbaodu', 'admin') NOT NULL,
  total_usage INT NOT NULL DEFAULT 100,    -- fixed at 100 per claim
  remaining_usage INT NOT NULL DEFAULT 0,
  claimed_at BIGINT,                        -- when user claimed the order
  order_id VARCHAR(64),                    -- mbaodu order that was claimed
  activation_code VARCHAR(32),             -- admin code if source='admin'
  expires_at BIGINT,                       -- only for admin codes
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_device (device_id),
  INDEX idx_order (order_id),
  INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Migrate existing device-only subscriptions to new schema
-- Old rows: device_id PRIMARY KEY → uid stays, device_id set, remaining_codes → remaining_usage
INSERT INTO subscriptions_new (uid, device_id, status, source, remaining_usage, order_id, activation_code, created_at)
SELECT device_id, device_id, status, source, remaining_codes, order_id, activation_code, created_at
FROM subscriptions
ON DUPLICATE KEY UPDATE
  device_id = VALUES(device_id),
  status = VALUES(status),
  remaining_usage = VALUES(remaining_usage);

DROP TABLE subscriptions;
RENAME TABLE subscriptions_new TO subscriptions;

-- ==================== Orders (claim tracking) ====================
-- Tracks mbaodu order payment status and claim state

CREATE TABLE IF NOT EXISTS orders_new (
  order_id VARCHAR(64) PRIMARY KEY,
  payment_status ENUM('pending', 'paid', 'invalid') NOT NULL DEFAULT 'pending',
  payment_time BIGINT,                      -- unix ms, from mbaodu query API
  claimed BOOLEAN NOT NULL DEFAULT FALSE,  -- has anyone claimed it?
  claimed_uid VARCHAR(64),                  -- who claimed it
  claimed_at BIGINT,                        -- when claimed
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_claimed_uid (claimed_uid),
  INDEX idx_payment_status (payment_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Migrate existing orders
INSERT INTO orders_new (order_id, payment_status, payment_time, claimed, claimed_uid, claimed_at, created_at)
SELECT order_id,
       IF(activated, 'paid', 'pending'),
       created_at,
       activated,
       NULL,
       NULL,
       created_at_ts
FROM orders
ON DUPLICATE KEY UPDATE
  payment_status = VALUES(payment_status);

DROP TABLE orders;
RENAME TABLE orders_new TO orders;

-- ==================== Activation Codes (legacy device-based, keep for migration) ====================
-- Add uid column for new flow (when user claims order, codes get uid)
ALTER TABLE activation_codes
  ADD COLUMN uid VARCHAR(64) AFTER device_id,
  ADD INDEX idx_uid (uid);

-- ==================== Admin Activation Codes (keep for backward compat + new account flow) ====================
-- uid: set when account-bound user activates; NULL = device-bound (old flow)
ALTER TABLE admin_activation_codes
  ADD COLUMN uid VARCHAR(64) AFTER device_id,
  ADD INDEX idx_uid (uid);

-- ==================== Conversations (add uid for cross-device sync) ====================
ALTER TABLE conversations
  ADD COLUMN uid VARCHAR(64) AFTER device_id,
  ADD INDEX idx_uid (uid);

-- ==================== Usage Events (add uid) ====================
ALTER TABLE usage_events
  ADD COLUMN uid VARCHAR(64) AFTER device_id,
  ADD INDEX idx_uid (uid);