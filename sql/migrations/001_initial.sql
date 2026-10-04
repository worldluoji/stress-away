-- stress-away MySQL Schema (全量最终态)
-- Run this against your MySQL 8.0 database
-- 本文件由历史迁移 001~005 合并而来（uid 化改造、reactions 表、
-- mbaodu 清理、多码叠加），旧增量迁移文件已删除，演进过程见 git 历史。

CREATE DATABASE IF NOT EXISTS stress_away;
USE stress_away;

-- Subscriptions (uid-based, multi-code stacking)
CREATE TABLE IF NOT EXISTS subscriptions (
  uid VARCHAR(64) PRIMARY KEY,
  device_id VARCHAR(64),                     -- current device, nullable
  status ENUM('active', 'inactive') NOT NULL DEFAULT 'inactive',
  source ENUM('mbaodu', 'admin') NOT NULL,   -- 'mbaodu' kept for legacy rows only
  total_usage INT NOT NULL DEFAULT 100,      -- fixed at 100 per claim
  remaining_usage INT NOT NULL DEFAULT 0,
  claimed_at BIGINT,                         -- when user claimed the order
  activation_code VARCHAR(32) COMMENT '最近一次绑定的管理端激活码（叠加模式下不代表唯一码）',
  expires_at BIGINT COMMENT '订阅到期时间 = MAX(所有绑定 admin_activation_codes.expires_at)',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_device (device_id),
  INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Admin-generated activation codes (single-use; one uid may bind multiple rows)
CREATE TABLE IF NOT EXISTS admin_activation_codes (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(32) NOT NULL UNIQUE,
  created_at BIGINT NOT NULL,
  expires_at BIGINT NOT NULL,
  total_times INT NOT NULL DEFAULT 50,
  used BOOLEAN NOT NULL DEFAULT FALSE,
  device_id VARCHAR(64),
  uid VARCHAR(64),                           -- NULL = device-bound (old flow)
  activation_time BIGINT,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_device (device_id),
  INDEX idx_expires (expires_at),
  INDEX idx_uid_used (uid, used)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Conversation history
CREATE TABLE IF NOT EXISTS conversations (
  id VARCHAR(32) PRIMARY KEY,
  device_id VARCHAR(64) NOT NULL,
  uid VARCHAR(64),
  title VARCHAR(100),
  scenario_id VARCHAR(32),
  scenario_answers TEXT,
  messages TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  INDEX idx_device_created (device_id, created_at DESC),
  INDEX idx_scenario (scenario_id),
  INDEX idx_uid (uid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Usage events for analytics
CREATE TABLE IF NOT EXISTS usage_events (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  device_id VARCHAR(64),
  uid VARCHAR(64),
  event_type ENUM('chat', 'scenario_view', 'copy', 'activate', 'free_consume') NOT NULL,
  scenario_id VARCHAR(32),
  meta TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_event_type_created (event_type, created_at),
  INDEX idx_scenario (scenario_id),
  INDEX idx_device (device_id),
  INDEX idx_uid (uid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Scenario aggregated stats
CREATE TABLE IF NOT EXISTS scenario_stats (
  scenario_id VARCHAR(32) PRIMARY KEY,
  view_count INT NOT NULL DEFAULT 0,
  chat_count INT NOT NULL DEFAULT 0,
  copy_count INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- messages: mirrors AI replies from conversations for stable lookup
CREATE TABLE IF NOT EXISTS messages (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  conversation_id VARCHAR(32) NOT NULL,
  message_index INT NOT NULL,
  message_id VARCHAR(36) NOT NULL UNIQUE,
  role ENUM('user','assistant') NOT NULL DEFAULT 'assistant',
  content TEXT,
  scenario_id VARCHAR(32),
  created_at BIGINT NOT NULL,
  INDEX idx_conversation (conversation_id),
  INDEX idx_message_id (message_id),
  INDEX idx_conversation_index (conversation_id, message_index),
  UNIQUE KEY uk_conv_index (conversation_id, message_index)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- message_reactions: likes for AI replies
CREATE TABLE IF NOT EXISTS message_reactions (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  uid VARCHAR(64) NOT NULL,
  message_id VARCHAR(36) NOT NULL,
  created_at BIGINT NOT NULL,
  UNIQUE KEY uk_uid_message (uid, message_id),
  INDEX idx_message (message_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- KV store: persistent short-term state (admin tokens, daily free quota, deviceId tracking)
CREATE TABLE IF NOT EXISTS kv_store (
  `key` VARCHAR(191) PRIMARY KEY,
  `value` TEXT NOT NULL,
  expires_at BIGINT NOT NULL,               -- unix ms
  INDEX idx_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- saved_messages: bookmarked AI replies
CREATE TABLE IF NOT EXISTS saved_messages (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  uid VARCHAR(64) NOT NULL,
  message_id VARCHAR(36) NOT NULL,
  conversation_id VARCHAR(32) NOT NULL,
  message_index INT NOT NULL,
  content TEXT,
  scenario_id VARCHAR(32),
  created_at BIGINT NOT NULL,
  UNIQUE KEY uk_uid_message (uid, message_id),
  INDEX idx_message (message_id),
  INDEX idx_uid_created (uid, created_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- labor_reports: paid 维权方案报告历史（uid-scoped，刷新/关窗口后仍可找回）
CREATE TABLE IF NOT EXISTS labor_reports (
  id VARCHAR(36) PRIMARY KEY,             -- crypto.randomUUID() (8-4-4-4-12)
  uid VARCHAR(64) NOT NULL,
  comp_json TEXT NOT NULL,             -- CompInput JSON
  intake_answers_json TEXT,            -- Record<string, string>
  narrative TEXT NOT NULL,
  computation_json TEXT NOT NULL,      -- CompBreakdown JSON（含 total/lines/warnings/wageSource）
  reply TEXT NOT NULL,                 -- 已 sanitize 的 markdown + 免责
  created_at BIGINT NOT NULL,
  INDEX idx_uid_created (uid, created_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
