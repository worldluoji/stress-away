-- stress-away MySQL Schema
-- Run this against your MySQL 8.0 database

CREATE DATABASE IF NOT EXISTS stress_away;
USE stress_away;

-- Subscriptions (device-based activation)
CREATE TABLE IF NOT EXISTS subscriptions (
  device_id VARCHAR(64) PRIMARY KEY,
  status ENUM('active', 'inactive') NOT NULL DEFAULT 'inactive',
  source ENUM('mbaodu', 'admin') NOT NULL,
  remaining_codes INT NOT NULL DEFAULT 0,
  activation_time BIGINT,
  activation_code_index TINYINT,
  order_id VARCHAR(64),
  expires_at BIGINT,
  activation_code VARCHAR(32),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_status (status),
  INDEX idx_order (order_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Mbaodu activation codes (one per order × 2 codes)
CREATE TABLE IF NOT EXISTS activation_codes (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  order_id VARCHAR(64) NOT NULL,
  code_index TINYINT NOT NULL,
  code VARCHAR(32) NOT NULL,
  used BOOLEAN NOT NULL DEFAULT FALSE,
  device_id VARCHAR(64),
  remaining_codes INT NOT NULL DEFAULT 50,
  activation_time BIGINT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_order_code (order_id, code_index),
  INDEX idx_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Admin-generated activation codes
CREATE TABLE IF NOT EXISTS admin_activation_codes (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(32) NOT NULL UNIQUE,
  created_at BIGINT NOT NULL,
  expires_at BIGINT NOT NULL,
  total_times INT NOT NULL DEFAULT 50,
  remaining_times INT NOT NULL DEFAULT 50,
  used BOOLEAN NOT NULL DEFAULT FALSE,
  device_id VARCHAR(64),
  activation_time BIGINT,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_device (device_id),
  INDEX idx_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Conversation history
CREATE TABLE IF NOT EXISTS conversations (
  id VARCHAR(32) PRIMARY KEY,
  device_id VARCHAR(64) NOT NULL,
  title VARCHAR(100),
  scenario_id VARCHAR(32),
  scenario_answers TEXT,
  messages TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  INDEX idx_device_created (device_id, created_at DESC),
  INDEX idx_scenario (scenario_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Usage events for analytics
CREATE TABLE IF NOT EXISTS usage_events (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  device_id VARCHAR(64),
  event_type ENUM('chat', 'scenario_view', 'copy', 'activate', 'free_consume') NOT NULL,
  scenario_id VARCHAR(32),
  meta TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_event_type_created (event_type, created_at),
  INDEX idx_scenario (scenario_id),
  INDEX idx_device (device_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Scenario aggregated stats
CREATE TABLE IF NOT EXISTS scenario_stats (
  scenario_id VARCHAR(32) PRIMARY KEY,
  view_count INT NOT NULL DEFAULT 0,
  chat_count INT NOT NULL DEFAULT 0,
  copy_count INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Orders (mbaodu order tracking)
CREATE TABLE IF NOT EXISTS orders (
  order_id VARCHAR(64) PRIMARY KEY,
  created_at BIGINT NOT NULL,
  activated BOOLEAN NOT NULL DEFAULT FALSE,
  INDEX idx_activated (activated)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;