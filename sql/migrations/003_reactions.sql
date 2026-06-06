-- Add message_id to ChatMessage, create reactions + saved tables
-- Run against stress_away database

USE stress_away;

-- NOTE: We don't create a separate messages table since conversations stores
-- messages as JSON. message_id is embedded in ChatMessage objects and also
-- stored in a lookup table for efficient API access.

-- messages table: mirrors AI replies from conversations for stable lookup
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