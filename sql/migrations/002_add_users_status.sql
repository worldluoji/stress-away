-- 002: 管理端账号生命周期（禁用/启用/硬删除）——存量库增量
-- 001 的 CREATE TABLE IF NOT EXISTS 不会改动已建好的表，已部署环境必须执行本文件
-- 全新安装只执行 001（已含最终态），本文件对其无意义（重复执行报 ER_DUP_FIELDNAME 可忽略）

-- users 增状态列：active | disabled（软删除），取值由代码常量约束，不用 ENUM
ALTER TABLE users ADD COLUMN status VARCHAR(16) NOT NULL DEFAULT 'active' AFTER role;

-- 历史漂移补丁：早期库 usage_events.event_type 为初版 ENUM 定义，
-- 新事件名（report_generate/paywall_block 等）写入会触发 1265 Data truncated 被静默丢弃。
-- ENUM→VARCHAR 转换保留已有标签文本；若该列已是 VARCHAR(32)，重复执行无害。
ALTER TABLE usage_events MODIFY COLUMN event_type VARCHAR(32) NOT NULL;
