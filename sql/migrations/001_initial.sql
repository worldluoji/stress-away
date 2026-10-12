-- stress-away MySQL Schema (全量最终态)
-- Run this against your MySQL 8.0 database
-- 本文件由历史迁移 001~005 合并而来（uid 化改造、reactions 表、
-- mbaodu 清理、多码叠加、激活码退役改管理端发放制），
-- 旧增量迁移文件已删除，演进过程见 git 历史。
-- 约定：本文件为合并基线（最终态，仅全新安装执行）；
-- 基线之后的表结构变更一律以 002_*.sql 起编号新增增量文件，
-- 已部署环境按编号顺序执行增量，不回头改 001。

CREATE DATABASE IF NOT EXISTS stress_away;
USE stress_away;

-- Users (自建账号：管理员发放，用户名+密码；id 为 uuid，即全站 uid)
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(64) PRIMARY KEY,                 -- crypto.randomUUID()，业务表 uid 列引用它
  username VARCHAR(32) NOT NULL,
  -- 格式 v1:<salt-hex>:<hash-hex>，Node crypto.scrypt 派生
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('admin', 'user') NOT NULL DEFAULT 'user',
  -- 账号生命周期：active | disabled（管理端软删除）；不用 ENUM，取值由代码常量约束
  status VARCHAR(16) NOT NULL DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Sessions (服务端会话：只存 token 的 SHA-256，DB 泄露不等于会话泄露)
CREATE TABLE IF NOT EXISTS sessions (
  token_hash CHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_sessions_user (user_id),
  CONSTRAINT fk_sessions_user FOREIGN KEY (user_id)
    REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Subscriptions (uid-based, 管理端发放制：remaining_usage > 0 即付费，无有效期)
CREATE TABLE IF NOT EXISTS subscriptions (
  uid VARCHAR(64) PRIMARY KEY,
  device_id VARCHAR(64),                     -- current device, nullable
  total_usage INT NOT NULL DEFAULT 0,        -- 累计发放次数
  remaining_usage INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_device (device_id)
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
  -- VARCHAR 而非 ENUM：事件类型会持续新增，ENUM 每次都要改表且静默丢弃未列值
  event_type VARCHAR(32) NOT NULL,
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
