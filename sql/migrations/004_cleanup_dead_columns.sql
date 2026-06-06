-- Remove unused remaining_times from admin_activation_codes
-- Each code is now single-use (used=TRUE after first activation), so remaining_times is dead

USE stress_away;

ALTER TABLE admin_activation_codes DROP COLUMN remaining_times;