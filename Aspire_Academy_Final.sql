-- ============================================================
-- ASPIRE ACADEMY - Definitive Database Schema
-- Sports Academy Management System
-- Database: MySQL 8.0+
-- ORM: Sequelize (Node.js)
-- Charset: utf8mb4 (full Unicode + Arabic)
-- Timezone: +03:00 (Asia/Riyadh)
-- Combined: 2026-02-12
--
-- Tables: 26 | Views: 6 | Procedures: 6 | Triggers: 6 | Events: 5
-- ============================================================

SET NAMES utf8mb4;
SET CHARACTER SET utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ============================================================
-- Create Database
-- ============================================================
CREATE DATABASE IF NOT EXISTS `academy_asp`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE `academy_asp`;

-- ============================================================
-- 1. branches
-- Academy branches / locations
-- ============================================================
CREATE TABLE IF NOT EXISTS `branches` (
  `id`             CHAR(36)       NOT NULL DEFAULT (UUID()),
  `name`           VARCHAR(200)   NOT NULL,
  `name_ar`        VARCHAR(200)   DEFAULT NULL,
  `code`           VARCHAR(20)    NOT NULL,
  `address`        TEXT           DEFAULT NULL,
  `city`           VARCHAR(100)   DEFAULT NULL,
  `region`         VARCHAR(100)   DEFAULT NULL,
  `phone`          VARCHAR(20)    DEFAULT NULL,
  `email`          VARCHAR(255)   DEFAULT NULL,
  `manager_id`     CHAR(36)       DEFAULT NULL,
  `latitude`       DECIMAL(10,8)  DEFAULT NULL,
  `longitude`      DECIMAL(11,8)  DEFAULT NULL,
  `capacity`       INT            DEFAULT 100,
  `facilities`     JSON           DEFAULT ('[]'),
  `working_hours`  JSON           DEFAULT ('{"sunday":{"open":"08:00","close":"22:00","closed":false},"monday":{"open":"08:00","close":"22:00","closed":false},"tuesday":{"open":"08:00","close":"22:00","closed":false},"wednesday":{"open":"08:00","close":"22:00","closed":false},"thursday":{"open":"08:00","close":"22:00","closed":false},"friday":{"open":"14:00","close":"22:00","closed":false},"saturday":{"open":"08:00","close":"22:00","closed":false}}'),
  `is_active`      TINYINT(1)     NOT NULL DEFAULT 1,
  `settings`       JSON           DEFAULT ('{}'),
  `created_at`     DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`     DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_branches_code` (`code`),
  KEY `idx_branches_code` (`code`),
  KEY `idx_branches_city` (`city`),
  KEY `idx_branches_is_active` (`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 2. users
-- All system users (parents, coaches, admins, etc.)
-- Password hashed with bcrypt (12 salt rounds) at app level
-- ============================================================
CREATE TABLE IF NOT EXISTS `users` (
  `id`                     CHAR(36)      NOT NULL DEFAULT (UUID()),
  `email`                  VARCHAR(255)  DEFAULT NULL,
  `password`               VARCHAR(255)  DEFAULT NULL COMMENT 'Nullable for OTP-only users; hashed with bcrypt',
  `phone`                  VARCHAR(20)   DEFAULT NULL,
  `first_name`             VARCHAR(100)  NOT NULL,
  `last_name`              VARCHAR(100)  NOT NULL,
  `name_ar`                VARCHAR(200)  DEFAULT NULL COMMENT 'Full name in Arabic',
  `date_of_birth`          DATE          DEFAULT NULL,
  `role`                   ENUM('parent','coach','branch_admin','accountant','super_admin','owner') NOT NULL DEFAULT 'parent',
  `account_type`           ENUM('parent','self_player') NOT NULL DEFAULT 'parent',
  `avatar`                 VARCHAR(500)  DEFAULT NULL,
  `branch_id`              CHAR(36)      DEFAULT NULL,
  `is_active`              TINYINT(1)    NOT NULL DEFAULT 1,
  `is_verified`            TINYINT(1)    NOT NULL DEFAULT 0,
  `last_login`             DATETIME      DEFAULT NULL,
  `password_reset_token`   VARCHAR(255)  DEFAULT NULL,
  `password_reset_expires` DATETIME      DEFAULT NULL,
  `preferences`            JSON          DEFAULT ('{"language":"ar","notifications":{"email":true,"sms":true,"push":true}}'),
  `permissions`            JSON          DEFAULT NULL COMMENT 'Custom permissions for super_admin role',
  `created_at`             DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`             DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_users_email` (`email`),
  KEY `idx_users_phone` (`phone`),
  KEY `idx_users_role` (`role`),
  KEY `idx_users_branch_id` (`branch_id`),
  KEY `idx_users_is_active` (`is_active`),
  CONSTRAINT `fk_users_branch` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Add deferred FK: branches.manager_id -> users.id (circular dependency)
ALTER TABLE `branches`
  ADD KEY `idx_branches_manager_id` (`manager_id`),
  ADD CONSTRAINT `fk_branches_manager` FOREIGN KEY (`manager_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================
-- 3. programs
-- Training programs offered by branches
-- ============================================================
CREATE TABLE IF NOT EXISTS `programs` (
  `id`                   CHAR(36)       NOT NULL DEFAULT (UUID()),
  `name`                 VARCHAR(200)   NOT NULL,
  `name_ar`              VARCHAR(200)   DEFAULT NULL,
  `description`          TEXT           DEFAULT NULL,
  `description_ar`       TEXT           DEFAULT NULL,
  `type`                 ENUM('training','competition','camp','private') NOT NULL DEFAULT 'training',
  `sport_type`           VARCHAR(100)   NOT NULL DEFAULT 'football',
  `branch_id`            CHAR(36)       NOT NULL,
  `age_group_min`        INT            DEFAULT 5,
  `age_group_max`        INT            DEFAULT 18,
  `capacity`             INT            DEFAULT 20,
  `current_enrollment`   INT            DEFAULT 0,
  `price_monthly`        DECIMAL(10,2)  NOT NULL DEFAULT 0.00,
  `price_quarterly`      DECIMAL(10,2)  DEFAULT NULL,
  `price_annual`         DECIMAL(10,2)  DEFAULT NULL,
  `registration_fee`     DECIMAL(10,2)  DEFAULT 0.00,
  `schedule`             JSON           DEFAULT ('[]') COMMENT 'Array of {day, start_time, end_time}',
  `start_date`           DATE           DEFAULT NULL,
  `end_date`             DATE           DEFAULT NULL,
  `is_active`            TINYINT(1)     NOT NULL DEFAULT 1,
  `image`                VARCHAR(500)   DEFAULT NULL,
  `features`             JSON           DEFAULT ('[]'),
  `created_at`           DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`           DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_programs_branch_id` (`branch_id`),
  KEY `idx_programs_type` (`type`),
  KEY `idx_programs_is_active` (`is_active`),
  KEY `idx_programs_sport_type` (`sport_type`),
  CONSTRAINT `fk_programs_branch` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 4. program_pricing_plans
-- Custom pricing plans per program
-- ============================================================
CREATE TABLE IF NOT EXISTS `program_pricing_plans` (
  `id`               CHAR(36)       NOT NULL DEFAULT (UUID()),
  `program_id`       CHAR(36)       NOT NULL,
  `name`             VARCHAR(100)   NOT NULL,
  `name_ar`          VARCHAR(100)   DEFAULT NULL,
  `duration_months`  INT            DEFAULT NULL COMMENT '1=monthly, 3=quarterly, 12=annual, NULL=custom',
  `price`            DECIMAL(10,2)  NOT NULL DEFAULT 0.00,
  `description`      TEXT           DEFAULT NULL,
  `description_ar`   TEXT           DEFAULT NULL,
  `is_active`        TINYINT(1)     NOT NULL DEFAULT 1,
  `sort_order`       INT            DEFAULT 0,
  `created_at`       DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`       DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ppp_program_id` (`program_id`),
  KEY `idx_ppp_is_active` (`is_active`),
  KEY `idx_ppp_sort_order` (`sort_order`),
  CONSTRAINT `fk_ppp_program` FOREIGN KEY (`program_id`) REFERENCES `programs` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 5. coach_programs (junction table)
-- Many-to-many: coaches <-> programs
-- ============================================================
CREATE TABLE IF NOT EXISTS `coach_programs` (
  `id`          CHAR(36)      NOT NULL DEFAULT (UUID()),
  `coach_id`    CHAR(36)      NOT NULL,
  `program_id`  CHAR(36)      NOT NULL,
  `is_primary`  TINYINT(1)    DEFAULT 0 COMMENT 'Whether this is the primary coach for the program',
  `assigned_at` DATETIME      DEFAULT CURRENT_TIMESTAMP,
  `created_at`  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_coach_programs_coach_program` (`coach_id`, `program_id`),
  KEY `idx_cp_coach_id` (`coach_id`),
  KEY `idx_cp_program_id` (`program_id`),
  CONSTRAINT `fk_cp_coach`   FOREIGN KEY (`coach_id`)   REFERENCES `users` (`id`)    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_cp_program` FOREIGN KEY (`program_id`) REFERENCES `programs` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 6. players
-- Registered players (children of parents or self-registered)
-- registration_number auto-generated at app level: PLR-YYYY-XXXXX
-- ============================================================
CREATE TABLE IF NOT EXISTS `players` (
  `id`                         CHAR(36)      NOT NULL DEFAULT (UUID()),
  `registration_number`        VARCHAR(50)   NOT NULL COMMENT 'Format: PLR-YYYY-XXXXX',
  `first_name`                 VARCHAR(100)  NOT NULL,
  `last_name`                  VARCHAR(100)  NOT NULL,
  `first_name_ar`              VARCHAR(100)  DEFAULT NULL,
  `last_name_ar`               VARCHAR(100)  DEFAULT NULL,
  `date_of_birth`              DATE          NOT NULL,
  `gender`                     ENUM('male','female') NOT NULL DEFAULT 'male',
  `national_id`                VARCHAR(20)   DEFAULT NULL,
  `nationality`                VARCHAR(100)  DEFAULT NULL,
  `address`                    VARCHAR(255)  DEFAULT NULL,
  `parent_id`                  CHAR(36)      NOT NULL,
  `self_user_id`               CHAR(36)      DEFAULT NULL COMMENT 'Links player to own user account (self-registered)',
  `branch_id`                  CHAR(36)      NOT NULL,
  `program_id`                 CHAR(36)      DEFAULT NULL,
  `coach_id`                   CHAR(36)      DEFAULT NULL,
  `status`                     ENUM('active','inactive','suspended','graduated') NOT NULL DEFAULT 'active',
  `avatar`                     VARCHAR(500)  DEFAULT NULL,
  `medical_notes`              TEXT          DEFAULT NULL,
  `allergies`                  JSON          DEFAULT ('[]'),
  `emergency_contact_name`     VARCHAR(200)  DEFAULT NULL,
  `emergency_contact_phone`    VARCHAR(20)   DEFAULT NULL,
  `emergency_contact_relation` VARCHAR(50)   DEFAULT NULL,
  `school_name`                VARCHAR(200)  DEFAULT NULL,
  `grade_level`                VARCHAR(50)   DEFAULT NULL,
  `jersey_size`                VARCHAR(10)   DEFAULT NULL,
  `shoe_size`                  VARCHAR(10)   DEFAULT NULL,
  `position`                   VARCHAR(50)   DEFAULT NULL,
  `skill_level`                ENUM('beginner','intermediate','advanced','professional') NOT NULL DEFAULT 'beginner',
  `join_date`                  DATE          DEFAULT (CURRENT_DATE),
  `notes`                      TEXT          DEFAULT NULL,
  `id_document`                VARCHAR(500)  DEFAULT NULL COMMENT 'Path to uploaded ID document file',
  `created_at`                 DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`                 DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_players_registration_number` (`registration_number`),
  KEY `idx_players_registration_number` (`registration_number`),
  KEY `idx_players_parent_id` (`parent_id`),
  KEY `idx_players_self_user_id` (`self_user_id`),
  KEY `idx_players_branch_id` (`branch_id`),
  KEY `idx_players_program_id` (`program_id`),
  KEY `idx_players_coach_id` (`coach_id`),
  KEY `idx_players_status` (`status`),
  KEY `idx_players_gender` (`gender`),
  CONSTRAINT `fk_players_parent`    FOREIGN KEY (`parent_id`)    REFERENCES `users` (`id`)     ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_players_self_user` FOREIGN KEY (`self_user_id`) REFERENCES `users` (`id`)     ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_players_branch`    FOREIGN KEY (`branch_id`)    REFERENCES `branches` (`id`)  ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_players_program`   FOREIGN KEY (`program_id`)   REFERENCES `programs` (`id`)  ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_players_coach`     FOREIGN KEY (`coach_id`)     REFERENCES `users` (`id`)     ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 7. subscriptions
-- Player subscriptions to programs with renewal chain
-- ============================================================
CREATE TABLE IF NOT EXISTS `subscriptions` (
  `id`               CHAR(36)       NOT NULL DEFAULT (UUID()),
  `player_id`        CHAR(36)       NOT NULL,
  `program_id`       CHAR(36)       NOT NULL,
  `plan_type`        ENUM('monthly','quarterly','annual','custom') NOT NULL DEFAULT 'monthly',
  `start_date`       DATE           NOT NULL,
  `end_date`         DATE           NOT NULL,
  `status`           ENUM('active','expired','suspended','cancelled','pending') NOT NULL DEFAULT 'pending',
  `amount`           DECIMAL(10,2)  NOT NULL,
  `discount_amount`  DECIMAL(10,2)  DEFAULT 0.00,
  `discount_reason`  VARCHAR(255)   DEFAULT NULL,
  `total_amount`     DECIMAL(10,2)  NOT NULL,
  `is_auto_renew`    TINYINT(1)     NOT NULL DEFAULT 0,
  `renewed_from_id`  CHAR(36)       DEFAULT NULL COMMENT 'Self-referencing FK for renewal chain',
  `notes`            TEXT           DEFAULT NULL,
  `created_at`       DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`       DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_subscriptions_player_id` (`player_id`),
  KEY `idx_subscriptions_program_id` (`program_id`),
  KEY `idx_subscriptions_status` (`status`),
  KEY `idx_subscriptions_end_date` (`end_date`),
  KEY `idx_subscriptions_renewed_from` (`renewed_from_id`),
  CONSTRAINT `fk_subscriptions_player`  FOREIGN KEY (`player_id`)       REFERENCES `players` (`id`)        ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_subscriptions_program` FOREIGN KEY (`program_id`)      REFERENCES `programs` (`id`)       ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_subscriptions_renewed` FOREIGN KEY (`renewed_from_id`) REFERENCES `subscriptions` (`id`)  ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 8. payments
-- Financial transactions
-- invoice_number auto-generated at app level: INV-YYYYMM-XXXXXX
-- ============================================================
CREATE TABLE IF NOT EXISTS `payments` (
  `id`                       CHAR(36)       NOT NULL DEFAULT (UUID()),
  `invoice_number`           VARCHAR(50)    NOT NULL COMMENT 'Format: INV-YYYYMM-XXXXXX',
  `user_id`                  CHAR(36)       NOT NULL,
  `player_id`                CHAR(36)       DEFAULT NULL,
  `subscription_id`          CHAR(36)       DEFAULT NULL,
  `branch_id`                CHAR(36)       DEFAULT NULL,
  `pricing_plan_id`          CHAR(36)       DEFAULT NULL,
  `type`                     ENUM('subscription','registration','product','other') NOT NULL DEFAULT 'subscription',
  `description`              VARCHAR(500)   DEFAULT NULL,
  `amount`                   DECIMAL(10,2)  NOT NULL,
  `tax_amount`               DECIMAL(10,2)  DEFAULT 0.00,
  `discount_amount`          DECIMAL(10,2)  DEFAULT 0.00,
  `total_amount`             DECIMAL(10,2)  NOT NULL,
  `currency`                 VARCHAR(3)     NOT NULL DEFAULT 'SAR',
  `payment_method`           ENUM('cash','credit_card','bank_transfer','mada','apple_pay','stc_pay') NOT NULL DEFAULT 'cash',
  `status`                   ENUM('pending','completed','failed','refunded','cancelled') NOT NULL DEFAULT 'pending',
  `transaction_id`           VARCHAR(255)   DEFAULT NULL,
  `payment_gateway_response` JSON           DEFAULT NULL,
  `paid_at`                  DATETIME       DEFAULT NULL,
  `due_date`                 DATE           DEFAULT NULL,
  `receipt_url`              VARCHAR(500)   DEFAULT NULL,
  `processed_by`             CHAR(36)       DEFAULT NULL,
  `notes`                    TEXT           DEFAULT NULL,
  `metadata`                 JSON           DEFAULT ('{}'),
  `created_at`               DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`               DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_payments_invoice_number` (`invoice_number`),
  KEY `idx_payments_invoice_number` (`invoice_number`),
  KEY `idx_payments_user_id` (`user_id`),
  KEY `idx_payments_player_id` (`player_id`),
  KEY `idx_payments_subscription_id` (`subscription_id`),
  KEY `idx_payments_branch_id` (`branch_id`),
  KEY `idx_payments_pricing_plan_id` (`pricing_plan_id`),
  KEY `idx_payments_status` (`status`),
  KEY `idx_payments_type` (`type`),
  KEY `idx_payments_payment_method` (`payment_method`),
  KEY `idx_payments_processed_by` (`processed_by`),
  KEY `idx_payments_paid_at` (`paid_at`),
  KEY `idx_payments_created_at` (`created_at`),
  CONSTRAINT `fk_payments_user`         FOREIGN KEY (`user_id`)         REFERENCES `users` (`id`)                  ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_payments_player`       FOREIGN KEY (`player_id`)       REFERENCES `players` (`id`)                ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_payments_subscription` FOREIGN KEY (`subscription_id`) REFERENCES `subscriptions` (`id`)          ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_payments_branch`       FOREIGN KEY (`branch_id`)       REFERENCES `branches` (`id`)               ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_payments_pricing_plan` FOREIGN KEY (`pricing_plan_id`) REFERENCES `program_pricing_plans` (`id`)  ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_payments_processor`    FOREIGN KEY (`processed_by`)    REFERENCES `users` (`id`)                  ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 9. discounts
-- Discount records with flexible scoping (branch/program/user/player/plan)
-- ============================================================
CREATE TABLE IF NOT EXISTS `discounts` (
  `id`               CHAR(36)       NOT NULL DEFAULT (UUID()),
  `branch_id`        CHAR(36)       NOT NULL,
  `program_id`       CHAR(36)       DEFAULT NULL COMMENT 'Scope: specific program',
  `user_id`          CHAR(36)       DEFAULT NULL COMMENT 'Parent user - discount applies to all their children',
  `player_id`        CHAR(36)       DEFAULT NULL COMMENT 'Specific player - most targeted scope',
  `pricing_plan_id`  CHAR(36)       DEFAULT NULL COMMENT 'Discount only applies to this specific pricing plan',
  `discount_type`    ENUM('percentage','fixed') NOT NULL DEFAULT 'fixed',
  `discount_value`   DECIMAL(10,2)  NOT NULL,
  `reason`           VARCHAR(500)   DEFAULT NULL,
  `status`           ENUM('active','used','expired','cancelled') NOT NULL DEFAULT 'active',
  `created_by`       CHAR(36)       NOT NULL,
  `used_at`          DATETIME       DEFAULT NULL,
  `payment_id`       CHAR(36)       DEFAULT NULL,
  `expires_at`       DATE           DEFAULT NULL,
  `created_at`       DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`       DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_discounts_branch_id` (`branch_id`),
  KEY `idx_discounts_program_id` (`program_id`),
  KEY `idx_discounts_user_id` (`user_id`),
  KEY `idx_discounts_player_id` (`player_id`),
  KEY `idx_discounts_pricing_plan_id` (`pricing_plan_id`),
  KEY `idx_discounts_status` (`status`),
  KEY `idx_discounts_created_by` (`created_by`),
  KEY `idx_discounts_payment_id` (`payment_id`),
  CONSTRAINT `fk_discounts_branch`       FOREIGN KEY (`branch_id`)       REFERENCES `branches` (`id`)               ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_discounts_program`      FOREIGN KEY (`program_id`)      REFERENCES `programs` (`id`)               ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_discounts_user`         FOREIGN KEY (`user_id`)         REFERENCES `users` (`id`)                  ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_discounts_player`       FOREIGN KEY (`player_id`)       REFERENCES `players` (`id`)                ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_discounts_pricing_plan` FOREIGN KEY (`pricing_plan_id`) REFERENCES `program_pricing_plans` (`id`)  ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_discounts_creator`      FOREIGN KEY (`created_by`)      REFERENCES `users` (`id`)                  ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_discounts_payment`      FOREIGN KEY (`payment_id`)      REFERENCES `payments` (`id`)               ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `chk_discount_value`        CHECK (`discount_value` >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 10. training_sessions
-- Individual training session instances with conflict-checking indexes
-- ============================================================
CREATE TABLE IF NOT EXISTS `training_sessions` (
  `id`                  CHAR(36)      NOT NULL DEFAULT (UUID()),
  `program_id`          CHAR(36)      NOT NULL,
  `branch_id`           CHAR(36)      NOT NULL,
  `coach_id`            CHAR(36)      NOT NULL,
  `date`                DATE          NOT NULL,
  `day_of_week`         ENUM('sunday','monday','tuesday','wednesday','thursday','friday','saturday') NOT NULL,
  `start_time`          TIME          NOT NULL,
  `end_time`            TIME          NOT NULL,
  `facility`            VARCHAR(100)  DEFAULT NULL,
  `max_capacity`        INT           NOT NULL DEFAULT 20,
  `current_enrollment`  INT           DEFAULT 0,
  `is_recurring`        TINYINT(1)    NOT NULL DEFAULT 1,
  `is_cancelled`        TINYINT(1)    NOT NULL DEFAULT 0,
  `cancellation_reason` TEXT          DEFAULT NULL,
  `cancelled_by`        CHAR(36)      DEFAULT NULL,
  `cancelled_at`        DATETIME      DEFAULT NULL,
  `notes`               TEXT          DEFAULT NULL,
  `attendance_marked`   TINYINT(1)    NOT NULL DEFAULT 0,
  `reminder_sent_24h`   TINYINT(1)    NOT NULL DEFAULT 0,
  `reminder_sent_1h`    TINYINT(1)    NOT NULL DEFAULT 0,
  `created_at`          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ts_program_id` (`program_id`),
  KEY `idx_ts_branch_id` (`branch_id`),
  KEY `idx_ts_coach_id` (`coach_id`),
  KEY `idx_ts_date` (`date`),
  KEY `idx_ts_day_of_week` (`day_of_week`),
  KEY `idx_ts_is_cancelled` (`is_cancelled`),
  KEY `idx_ts_is_recurring` (`is_recurring`),
  KEY `idx_ts_attendance_marked` (`attendance_marked`),
  KEY `idx_ts_coach_schedule` (`coach_id`, `date`, `start_time`, `end_time`),
  KEY `idx_ts_facility_schedule` (`branch_id`, `facility`, `date`, `start_time`, `end_time`),
  KEY `idx_ts_branch_date` (`branch_id`, `date`, `is_cancelled`),
  CONSTRAINT `fk_ts_program`      FOREIGN KEY (`program_id`)   REFERENCES `programs` (`id`)  ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_ts_branch`       FOREIGN KEY (`branch_id`)    REFERENCES `branches` (`id`)  ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_ts_coach`        FOREIGN KEY (`coach_id`)     REFERENCES `users` (`id`)     ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_ts_cancelled_by` FOREIGN KEY (`cancelled_by`) REFERENCES `users` (`id`)     ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 11. attendance (player attendance)
-- ============================================================
CREATE TABLE IF NOT EXISTS `attendance` (
  `id`                 CHAR(36)      NOT NULL DEFAULT (UUID()),
  `player_id`          CHAR(36)      NOT NULL,
  `program_id`         CHAR(36)      NOT NULL,
  `session_id`         CHAR(36)      DEFAULT NULL COMMENT 'Link to specific training session',
  `session_date`       DATE          NOT NULL,
  `session_time`       TIME          DEFAULT NULL,
  `status`             ENUM('present','absent','late','leave') NOT NULL DEFAULT 'present',
  `check_in_time`      TIME          DEFAULT NULL,
  `check_out_time`     TIME          DEFAULT NULL,
  `recorded_by`        CHAR(36)      DEFAULT NULL,
  `notes`              TEXT          DEFAULT NULL,
  `excuse_reason`      VARCHAR(500)  DEFAULT NULL,
  `performance_rating` INT           DEFAULT NULL COMMENT 'Rating 1-5',
  `performance_notes`  TEXT          DEFAULT NULL,
  `created_at`         DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`         DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_attendance_player_program_date` (`player_id`, `program_id`, `session_date`),
  KEY `idx_attendance_player_id` (`player_id`),
  KEY `idx_attendance_program_id` (`program_id`),
  KEY `idx_attendance_session_id` (`session_id`),
  KEY `idx_attendance_session_date` (`session_date`),
  KEY `idx_attendance_status` (`status`),
  KEY `idx_attendance_recorded_by` (`recorded_by`),
  CONSTRAINT `fk_attendance_player`   FOREIGN KEY (`player_id`)   REFERENCES `players` (`id`)           ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_attendance_program`  FOREIGN KEY (`program_id`)  REFERENCES `programs` (`id`)          ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_attendance_session`  FOREIGN KEY (`session_id`)  REFERENCES `training_sessions` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_attendance_recorder` FOREIGN KEY (`recorded_by`) REFERENCES `users` (`id`)             ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `chk_attendance_rating`  CHECK (`performance_rating` IS NULL OR (`performance_rating` >= 1 AND `performance_rating` <= 5))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 12. coach_attendance
-- ============================================================
CREATE TABLE IF NOT EXISTS `coach_attendance` (
  `id`          CHAR(36)      NOT NULL DEFAULT (UUID()),
  `coach_id`    CHAR(36)      NOT NULL,
  `branch_id`   CHAR(36)      NOT NULL,
  `date`        DATE          NOT NULL,
  `status`      ENUM('present','absent','late','leave') NOT NULL DEFAULT 'absent',
  `notes`       TEXT          DEFAULT NULL,
  `recorded_by` CHAR(36)      DEFAULT NULL,
  `created_at`  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_coach_attendance_coach_date` (`coach_id`, `date`),
  KEY `idx_coach_att_coach_id` (`coach_id`),
  KEY `idx_coach_att_branch_id` (`branch_id`),
  KEY `idx_coach_att_date` (`date`),
  KEY `idx_coach_att_status` (`status`),
  KEY `idx_coach_att_recorded_by` (`recorded_by`),
  CONSTRAINT `fk_coach_att_coach`    FOREIGN KEY (`coach_id`)    REFERENCES `users` (`id`)    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_coach_att_branch`   FOREIGN KEY (`branch_id`)   REFERENCES `branches` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_coach_att_recorder` FOREIGN KEY (`recorded_by`) REFERENCES `users` (`id`)    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 13. evaluations
-- Player performance evaluations by coaches
-- Averages auto-calculated by app-level hooks AND DB triggers
-- ============================================================
CREATE TABLE IF NOT EXISTS `evaluations` (
  `id`               CHAR(36)       NOT NULL DEFAULT (UUID()),
  `player_id`        CHAR(36)       NOT NULL,
  `coach_id`         CHAR(36)       NOT NULL,
  `session_id`       CHAR(36)       DEFAULT NULL COMMENT 'Optional link to training session',
  `evaluation_type`  ENUM('quick','detailed') NOT NULL DEFAULT 'quick',
  -- Quick evaluation
  `overall_rating`   INT            DEFAULT NULL COMMENT 'Rating 1-5',
  `notes`            TEXT           DEFAULT NULL,
  `goals`            INT            DEFAULT 0 COMMENT 'Number of goals scored in session',
  -- Technical Skills (1-5)
  `ball_control`     INT            DEFAULT NULL,
  `passing`          INT            DEFAULT NULL,
  `shooting`         INT            DEFAULT NULL,
  `dribbling`        INT            DEFAULT NULL,
  -- Physical Skills (1-5)
  `speed`            INT            DEFAULT NULL,
  `stamina`          INT            DEFAULT NULL,
  `strength`         INT            DEFAULT NULL,
  `agility`          INT            DEFAULT NULL,
  -- Mental Attributes (1-5)
  `attitude`         INT            DEFAULT NULL,
  `discipline`       INT            DEFAULT NULL,
  `teamwork`         INT            DEFAULT NULL,
  `effort`           INT            DEFAULT NULL,
  -- Calculated averages (auto-computed by triggers / app hooks)
  `technical_avg`    DECIMAL(3,2)   DEFAULT NULL,
  `physical_avg`     DECIMAL(3,2)   DEFAULT NULL,
  `mental_avg`       DECIMAL(3,2)   DEFAULT NULL,
  `evaluation_date`  DATE           NOT NULL DEFAULT (CURRENT_DATE),
  `created_at`       DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`       DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_evaluations_player_id` (`player_id`),
  KEY `idx_evaluations_coach_id` (`coach_id`),
  KEY `idx_evaluations_session_id` (`session_id`),
  KEY `idx_evaluations_date` (`evaluation_date`),
  KEY `idx_evaluations_type` (`evaluation_type`),
  CONSTRAINT `fk_evaluations_player`  FOREIGN KEY (`player_id`)  REFERENCES `players` (`id`)           ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_evaluations_coach`   FOREIGN KEY (`coach_id`)   REFERENCES `users` (`id`)             ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_evaluations_session` FOREIGN KEY (`session_id`) REFERENCES `training_sessions` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `chk_eval_overall`       CHECK (`overall_rating` IS NULL OR (`overall_rating` >= 1 AND `overall_rating` <= 5)),
  CONSTRAINT `chk_eval_ball_control`  CHECK (`ball_control`    IS NULL OR (`ball_control`    >= 1 AND `ball_control`    <= 5)),
  CONSTRAINT `chk_eval_passing`       CHECK (`passing`         IS NULL OR (`passing`         >= 1 AND `passing`         <= 5)),
  CONSTRAINT `chk_eval_shooting`      CHECK (`shooting`        IS NULL OR (`shooting`        >= 1 AND `shooting`        <= 5)),
  CONSTRAINT `chk_eval_dribbling`     CHECK (`dribbling`       IS NULL OR (`dribbling`       >= 1 AND `dribbling`       <= 5)),
  CONSTRAINT `chk_eval_speed`         CHECK (`speed`           IS NULL OR (`speed`           >= 1 AND `speed`           <= 5)),
  CONSTRAINT `chk_eval_stamina`       CHECK (`stamina`         IS NULL OR (`stamina`         >= 1 AND `stamina`         <= 5)),
  CONSTRAINT `chk_eval_strength`      CHECK (`strength`        IS NULL OR (`strength`        >= 1 AND `strength`        <= 5)),
  CONSTRAINT `chk_eval_agility`       CHECK (`agility`         IS NULL OR (`agility`         >= 1 AND `agility`         <= 5)),
  CONSTRAINT `chk_eval_attitude`      CHECK (`attitude`        IS NULL OR (`attitude`        >= 1 AND `attitude`        <= 5)),
  CONSTRAINT `chk_eval_discipline`    CHECK (`discipline`      IS NULL OR (`discipline`      >= 1 AND `discipline`      <= 5)),
  CONSTRAINT `chk_eval_teamwork`      CHECK (`teamwork`        IS NULL OR (`teamwork`        >= 1 AND `teamwork`        <= 5)),
  CONSTRAINT `chk_eval_effort`        CHECK (`effort`          IS NULL OR (`effort`          >= 1 AND `effort`          <= 5))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 14. expenses
-- Branch expense tracking
-- ============================================================
CREATE TABLE IF NOT EXISTS `expenses` (
  `id`                   CHAR(36)       NOT NULL DEFAULT (UUID()),
  `branch_id`            CHAR(36)       NOT NULL,
  `category`             ENUM('utilities','rent','salaries','equipment','maintenance','supplies','marketing','transportation','other') NOT NULL DEFAULT 'other',
  `title`                VARCHAR(200)   NOT NULL,
  `description`          TEXT           DEFAULT NULL,
  `amount`               DECIMAL(10,2)  NOT NULL,
  `currency`             VARCHAR(3)     NOT NULL DEFAULT 'SAR',
  `expense_date`         DATE           NOT NULL DEFAULT (CURRENT_DATE),
  `payment_method`       ENUM('cash','bank_transfer','credit_card','cheque') NOT NULL DEFAULT 'cash',
  `receipt_number`       VARCHAR(100)   DEFAULT NULL,
  `receipt_url`          VARCHAR(500)   DEFAULT NULL,
  `vendor_name`          VARCHAR(200)   DEFAULT NULL,
  `notes`                TEXT           DEFAULT NULL,
  `created_by`           CHAR(36)       NOT NULL,
  `is_recurring`         TINYINT(1)     NOT NULL DEFAULT 0,
  `recurring_frequency`  ENUM('daily','weekly','monthly','yearly') DEFAULT NULL,
  `created_at`           DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`           DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_expenses_branch_id` (`branch_id`),
  KEY `idx_expenses_category` (`category`),
  KEY `idx_expenses_expense_date` (`expense_date`),
  KEY `idx_expenses_created_by` (`created_by`),
  CONSTRAINT `fk_expenses_branch`  FOREIGN KEY (`branch_id`)  REFERENCES `branches` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_expenses_creator` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`)    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 15. waitlist
-- Player waitlist for full-capacity programs
-- ============================================================
CREATE TABLE IF NOT EXISTS `waitlist` (
  `id`          CHAR(36)      NOT NULL DEFAULT (UUID()),
  `player_id`   CHAR(36)      NOT NULL,
  `program_id`  CHAR(36)      NOT NULL,
  `branch_id`   CHAR(36)      NOT NULL,
  `parent_id`   CHAR(36)      NOT NULL,
  `position`    INT           NOT NULL,
  `status`      ENUM('waiting','notified','enrolled','expired','cancelled') NOT NULL DEFAULT 'waiting',
  `notified_at` DATETIME      DEFAULT NULL,
  `expires_at`  DATETIME      DEFAULT NULL,
  `enrolled_at` DATETIME      DEFAULT NULL,
  `notes`       TEXT          DEFAULT NULL,
  `created_at`  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_waitlist_player_program` (`player_id`, `program_id`),
  KEY `idx_waitlist_player_id` (`player_id`),
  KEY `idx_waitlist_program_id` (`program_id`),
  KEY `idx_waitlist_branch_id` (`branch_id`),
  KEY `idx_waitlist_parent_id` (`parent_id`),
  KEY `idx_waitlist_status` (`status`),
  KEY `idx_waitlist_position` (`position`),
  KEY `idx_waitlist_program_status_pos` (`program_id`, `status`, `position`),
  CONSTRAINT `fk_waitlist_player`  FOREIGN KEY (`player_id`)  REFERENCES `players` (`id`)  ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_waitlist_program` FOREIGN KEY (`program_id`) REFERENCES `programs` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_waitlist_branch`  FOREIGN KEY (`branch_id`)  REFERENCES `branches` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_waitlist_parent`  FOREIGN KEY (`parent_id`)  REFERENCES `users` (`id`)    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 16. subscription_freezes
-- Freeze periods for subscriptions (global, branch, program, or player)
-- ============================================================
CREATE TABLE IF NOT EXISTS `subscription_freezes` (
  `id`                      CHAR(36)      NOT NULL DEFAULT (UUID()),
  `title`                   VARCHAR(200)  NOT NULL,
  `title_ar`                VARCHAR(200)  DEFAULT NULL,
  `start_date`              DATE          NOT NULL,
  `end_date`                DATE          NOT NULL,
  `freeze_days`             INT           NOT NULL,
  `scope`                   ENUM('global','branch','program') NOT NULL DEFAULT 'global',
  `branch_id`               CHAR(36)      DEFAULT NULL,
  `program_id`              CHAR(36)      DEFAULT NULL,
  `player_id`               VARCHAR(36)   DEFAULT NULL COMMENT 'Per-player freeze scoping',
  `status`                  ENUM('scheduled','active','completed','cancelled') NOT NULL DEFAULT 'scheduled',
  `created_by`              CHAR(36)      NOT NULL,
  `applied`                 TINYINT(1)    NOT NULL DEFAULT 0,
  `subscriptions_affected`  INT           NOT NULL DEFAULT 0,
  `created_at`              DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`              DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_sf_status` (`status`),
  KEY `idx_sf_dates` (`start_date`, `end_date`),
  KEY `idx_sf_branch_id` (`branch_id`),
  KEY `idx_sf_program_id` (`program_id`),
  KEY `idx_sf_player_id` (`player_id`),
  CONSTRAINT `fk_sf_branch`  FOREIGN KEY (`branch_id`)  REFERENCES `branches` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_sf_program` FOREIGN KEY (`program_id`) REFERENCES `programs` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_sf_creator` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`)    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 17. announcements
-- System-wide announcements
-- ============================================================
CREATE TABLE IF NOT EXISTS `announcements` (
  `id`                 CHAR(36)      NOT NULL DEFAULT (UUID()),
  `title`              VARCHAR(255)  NOT NULL,
  `title_ar`           VARCHAR(255)  DEFAULT NULL,
  `content`            TEXT          NOT NULL,
  `content_ar`         TEXT          DEFAULT NULL,
  `type`               ENUM('general','urgent','event','maintenance') NOT NULL DEFAULT 'general',
  `priority`           ENUM('low','medium','high') NOT NULL DEFAULT 'medium',
  `author_id`          CHAR(36)      NOT NULL,
  `target_audience`    JSON          DEFAULT ('{"type":"all"}') COMMENT '{type:"all"|"roles"|"specific", roles:[], branches:{}, users:[]}',
  `target_branch_id`   CHAR(36)      DEFAULT NULL,
  `target_program_id`  CHAR(36)      DEFAULT NULL,
  `image`              VARCHAR(500)  DEFAULT NULL,
  `attachments`        JSON          DEFAULT ('[]'),
  `is_published`       TINYINT(1)    NOT NULL DEFAULT 0,
  `published_at`       DATETIME      DEFAULT NULL,
  `expires_at`         DATETIME      DEFAULT NULL,
  `is_pinned`          TINYINT(1)    NOT NULL DEFAULT 0,
  `send_notification`  TINYINT(1)    NOT NULL DEFAULT 1,
  `send_sms`           TINYINT(1)    NOT NULL DEFAULT 0,
  `views_count`        INT           DEFAULT 0,
  `created_at`         DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`         DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_announcements_author_id` (`author_id`),
  KEY `idx_announcements_type` (`type`),
  KEY `idx_announcements_is_published` (`is_published`),
  KEY `idx_announcements_target_branch` (`target_branch_id`),
  KEY `idx_announcements_target_program` (`target_program_id`),
  KEY `idx_announcements_expires_at` (`expires_at`),
  CONSTRAINT `fk_announcements_author`  FOREIGN KEY (`author_id`)         REFERENCES `users` (`id`)    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_announcements_branch`  FOREIGN KEY (`target_branch_id`)  REFERENCES `branches` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_announcements_program` FOREIGN KEY (`target_program_id`) REFERENCES `programs` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 18. branch_announcements
-- Branch-specific announcements
-- ============================================================
CREATE TABLE IF NOT EXISTS `branch_announcements` (
  `id`               CHAR(36)      NOT NULL DEFAULT (UUID()),
  `branch_id`        CHAR(36)      NOT NULL,
  `title`            VARCHAR(255)  NOT NULL,
  `title_ar`         VARCHAR(255)  DEFAULT NULL,
  `content`          TEXT          NOT NULL,
  `content_ar`       TEXT          DEFAULT NULL,
  `target_audience`  VARCHAR(50)   NOT NULL DEFAULT 'all' COMMENT 'all, parents, coaches, players, or JSON for specific users',
  `author_id`        CHAR(36)      NOT NULL,
  `is_published`     TINYINT(1)    NOT NULL DEFAULT 1,
  `is_pinned`        TINYINT(1)    NOT NULL DEFAULT 0,
  `expires_at`       DATETIME      DEFAULT NULL,
  `created_at`       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_branch_ann_branch_id` (`branch_id`),
  KEY `idx_branch_ann_author_id` (`author_id`),
  KEY `idx_branch_ann_is_published` (`is_published`),
  CONSTRAINT `fk_branch_ann_branch` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_branch_ann_author` FOREIGN KEY (`author_id`) REFERENCES `users` (`id`)    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 19. automatic_announcements
-- Scheduled automatic announcements
-- ============================================================
CREATE TABLE IF NOT EXISTS `automatic_announcements` (
  `id`                CHAR(36)      NOT NULL DEFAULT (UUID()),
  `name`              VARCHAR(255)  NOT NULL,
  `type`              ENUM('payment_reminder','session_reminder','welcome','holiday','general') NOT NULL DEFAULT 'general',
  `target_audience`   JSON          DEFAULT ('{"type":"all"}') COMMENT '{type:"all"|"roles"|"specific", roles:[], branches:{}, users:[]}',
  `schedule_type`     ENUM('date_range','specific_days') NOT NULL DEFAULT 'date_range',
  `start_date`        DATE          DEFAULT NULL,
  `end_date`          DATE          DEFAULT NULL,
  `send_time`         TIME          NOT NULL,
  `send_days`         JSON          DEFAULT NULL COMMENT 'Array of day names for specific_days schedule type',
  `message`           TEXT          NOT NULL,
  `send_notification` TINYINT(1)    NOT NULL DEFAULT 1,
  `is_active`         TINYINT(1)    NOT NULL DEFAULT 1,
  `created_by`        CHAR(36)      NOT NULL,
  `last_sent_at`      DATETIME      DEFAULT NULL,
  `send_count`        INT           DEFAULT 0,
  `created_at`        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_auto_ann_type` (`type`),
  KEY `idx_auto_ann_is_active` (`is_active`),
  KEY `idx_auto_ann_created_by` (`created_by`),
  CONSTRAINT `fk_auto_ann_creator` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 20. accountant_auto_announcements
-- Accountant-specific automatic announcements
-- ============================================================
CREATE TABLE IF NOT EXISTS `accountant_auto_announcements` (
  `id`               CHAR(36)      NOT NULL DEFAULT (UUID()),
  `title`            VARCHAR(200)  NOT NULL,
  `type`             ENUM('subscription_expiring','payment_overdue') NOT NULL,
  `enabled`          TINYINT(1)    NOT NULL DEFAULT 1,
  `trigger_mode`     ENUM('days','specific_date') NOT NULL DEFAULT 'days',
  `days_before`      INT           DEFAULT 7,
  `days_after`       INT           DEFAULT 3,
  `specific_date`    DATE          DEFAULT NULL,
  `message`          TEXT          NOT NULL,
  `send_time`        TIME          DEFAULT '09:00:00',
  `target_audience`  JSON          DEFAULT NULL,
  `created_by`       CHAR(36)      NOT NULL,
  `last_run_at`      DATETIME      DEFAULT NULL,
  `last_run_count`   INT           DEFAULT 0,
  `created_at`       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_acc_auto_ann_type` (`type`),
  KEY `idx_acc_auto_ann_enabled` (`enabled`),
  KEY `idx_acc_auto_ann_created_by` (`created_by`),
  CONSTRAINT `fk_acc_auto_ann_creator` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 21. sms_messages
-- SMS message records
-- ============================================================
CREATE TABLE IF NOT EXISTS `sms_messages` (
  `id`                CHAR(36)       NOT NULL DEFAULT (UUID()),
  `sender_id`         CHAR(36)       NOT NULL,
  `recipient_type`    ENUM('individual','group','branch','program','all') NOT NULL DEFAULT 'individual',
  `recipients`        JSON           NOT NULL DEFAULT ('[]') COMMENT 'Array of {user_id, phone, name}',
  `message`           TEXT           NOT NULL,
  `template_id`       VARCHAR(100)   DEFAULT NULL,
  `branch_id`         CHAR(36)       DEFAULT NULL,
  `program_id`        CHAR(36)       DEFAULT NULL,
  `status`            ENUM('pending','sent','delivered','failed') NOT NULL DEFAULT 'pending',
  `total_recipients`  INT            DEFAULT 0,
  `successful_count`  INT            DEFAULT 0,
  `failed_count`      INT            DEFAULT 0,
  `cost`              DECIMAL(10,4)  DEFAULT 0.0000,
  `provider_response` JSON           DEFAULT NULL,
  `scheduled_at`      DATETIME       DEFAULT NULL,
  `sent_at`           DATETIME       DEFAULT NULL,
  `error_message`     TEXT           DEFAULT NULL,
  `created_at`        DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`        DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_sms_sender_id` (`sender_id`),
  KEY `idx_sms_status` (`status`),
  KEY `idx_sms_branch_id` (`branch_id`),
  KEY `idx_sms_program_id` (`program_id`),
  KEY `idx_sms_scheduled_at` (`scheduled_at`),
  CONSTRAINT `fk_sms_sender`  FOREIGN KEY (`sender_id`)  REFERENCES `users` (`id`)    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_sms_branch`  FOREIGN KEY (`branch_id`)  REFERENCES `branches` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_sms_program` FOREIGN KEY (`program_id`) REFERENCES `programs` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 22. auto_sms_settings
-- Automatic SMS settings / templates
-- ============================================================
CREATE TABLE IF NOT EXISTS `auto_sms_settings` (
  `id`               CHAR(36)       NOT NULL DEFAULT (UUID()),
  `title`            VARCHAR(200)   NOT NULL,
  `title_ar`         VARCHAR(200)   DEFAULT NULL,
  `type`             ENUM('subscription_expiring','payment_overdue','session_reminder','birthday','custom') NOT NULL,
  `enabled`          TINYINT(1)     NOT NULL DEFAULT 1,
  `trigger_mode`     ENUM('days','specific_date') NOT NULL DEFAULT 'days' COMMENT 'Trigger by days before/after or on specific date',
  `days_before`      INT            DEFAULT 0,
  `days_after`       INT            DEFAULT 0,
  `specific_date`    DATE           DEFAULT NULL COMMENT 'When trigger_mode is specific_date',
  `message`          TEXT           NOT NULL,
  `message_ar`       TEXT           DEFAULT NULL,
  `target_role`      ENUM('parent','coach','all') NOT NULL DEFAULT 'parent',
  `branch_id`        CHAR(36)       DEFAULT NULL,
  `send_time`        TIME           DEFAULT '09:00:00',
  `schedule_type`    ENUM('date_range','specific_days') NOT NULL DEFAULT 'date_range',
  `start_date`       DATE           DEFAULT NULL,
  `end_date`         DATE           DEFAULT NULL,
  `send_days`        JSON           DEFAULT ('[]'),
  `target_audience`  JSON           DEFAULT NULL,
  `last_run_at`      DATETIME       DEFAULT NULL,
  `last_run_count`   INT            DEFAULT 0,
  `created_at`       DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`       DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_auto_sms_type` (`type`),
  KEY `idx_auto_sms_enabled` (`enabled`),
  KEY `idx_auto_sms_branch_id` (`branch_id`),
  CONSTRAINT `fk_auto_sms_branch` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 23. notifications
-- User notifications
-- ============================================================
CREATE TABLE IF NOT EXISTS `notifications` (
  `id`          CHAR(36)      NOT NULL DEFAULT (UUID()),
  `user_id`     CHAR(36)      NOT NULL,
  `type`        ENUM('new_registration','payment_received','payment_overdue','subscription_expiring','low_attendance','staff_activity','system_alert','general') NOT NULL DEFAULT 'general',
  `title`       VARCHAR(255)  NOT NULL,
  `title_ar`    VARCHAR(255)  DEFAULT NULL,
  `message`     TEXT          DEFAULT NULL,
  `message_ar`  TEXT          DEFAULT NULL,
  `data`        JSON          DEFAULT ('{}'),
  `is_read`     TINYINT(1)    NOT NULL DEFAULT 0,
  `read_at`     DATETIME      DEFAULT NULL,
  `created_at`  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_notifications_user_id` (`user_id`),
  KEY `idx_notifications_type` (`type`),
  KEY `idx_notifications_is_read` (`is_read`),
  KEY `idx_notifications_created_at` (`created_at`),
  CONSTRAINT `fk_notifications_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 24. sessions (authentication)
-- User login sessions with JWT tokens
-- ============================================================
CREATE TABLE IF NOT EXISTS `sessions` (
  `id`             CHAR(36)      NOT NULL DEFAULT (UUID()),
  `user_id`        CHAR(36)      NOT NULL,
  `token`          VARCHAR(500)  NOT NULL,
  `refresh_token`  VARCHAR(500)  DEFAULT NULL,
  `device_info`    JSON          DEFAULT ('{}'),
  `ip_address`     VARCHAR(45)   DEFAULT NULL,
  `user_agent`     TEXT          DEFAULT NULL,
  `is_active`      TINYINT(1)    NOT NULL DEFAULT 1,
  `expires_at`     DATETIME      NOT NULL,
  `last_activity`  DATETIME      DEFAULT CURRENT_TIMESTAMP,
  `created_at`     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_sessions_user_id` (`user_id`),
  KEY `idx_sessions_token` (`token`(191)),
  KEY `idx_sessions_is_active` (`is_active`),
  KEY `idx_sessions_expires_at` (`expires_at`),
  CONSTRAINT `fk_sessions_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 25. otps
-- One-Time Passwords for phone verification
-- ============================================================
CREATE TABLE IF NOT EXISTS `otps` (
  `id`           CHAR(36)      NOT NULL DEFAULT (UUID()),
  `phone`        VARCHAR(20)   NOT NULL,
  `code`         VARCHAR(10)   NOT NULL,
  `purpose`      ENUM('login','register','reset_password','verify_phone') NOT NULL DEFAULT 'login',
  `attempts`     INT           DEFAULT 0,
  `max_attempts` INT           DEFAULT 3,
  `is_used`      TINYINT(1)    NOT NULL DEFAULT 0,
  `expires_at`   DATETIME      NOT NULL,
  `verified_at`  DATETIME      DEFAULT NULL,
  `ip_address`   VARCHAR(45)   DEFAULT NULL,
  `user_agent`   TEXT          DEFAULT NULL,
  `created_at`   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_otps_phone` (`phone`),
  KEY `idx_otps_code` (`code`),
  KEY `idx_otps_purpose` (`purpose`),
  KEY `idx_otps_is_used` (`is_used`),
  KEY `idx_otps_expires_at` (`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 26. audit_logs
-- System-wide audit trail for all CRUD operations
-- ============================================================
CREATE TABLE IF NOT EXISTS `audit_logs` (
  `id`           CHAR(36)      NOT NULL DEFAULT (UUID()),
  `module`       VARCHAR(100)  NOT NULL,
  `entity_type`  VARCHAR(100)  NOT NULL,
  `entity_id`    VARCHAR(100)  NOT NULL,
  `action`       ENUM('create','update','delete','toggle','bulk_update') NOT NULL,
  `actor_id`     CHAR(36)      NOT NULL,
  `actor_role`   VARCHAR(50)   NOT NULL,
  `before_data`  JSON          DEFAULT NULL,
  `after_data`   JSON          DEFAULT NULL,
  `metadata`     JSON          DEFAULT NULL,
  `created_at`   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_audit_module` (`module`),
  KEY `idx_audit_entity` (`entity_type`, `entity_id`),
  KEY `idx_audit_actor_id` (`actor_id`),
  KEY `idx_audit_created_at` (`created_at`),
  CONSTRAINT `fk_audit_actor` FOREIGN KEY (`actor_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- Re-enable foreign key checks
-- ============================================================
SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================
-- SEED DATA
-- ============================================================

-- System user for unassigned / orphaned players (required by app)
INSERT INTO `users` (`id`, `email`, `phone`, `first_name`, `last_name`, `name_ar`, `role`, `account_type`, `is_active`, `is_verified`)
VALUES (
  UUID(),
  'unassigned@system.local',
  '0000000000',
  'Unassigned',
  'Parent',
  'ولي أمر غير محدد',
  'parent',
  'parent',
  0,
  1
) ON DUPLICATE KEY UPDATE `id` = `id`;

-- ============================================================
-- VIEWS
-- ============================================================

-- View: Active players with full details
CREATE OR REPLACE VIEW `v_active_players` AS
SELECT
  p.`id`,
  p.`registration_number`,
  CONCAT(p.`first_name`, ' ', p.`last_name`) AS `full_name`,
  CONCAT(p.`first_name_ar`, ' ', p.`last_name_ar`) AS `full_name_ar`,
  p.`date_of_birth`,
  TIMESTAMPDIFF(YEAR, p.`date_of_birth`, CURDATE()) AS `age`,
  p.`gender`,
  p.`nationality`,
  p.`status`,
  p.`skill_level`,
  b.`name` AS `branch_name`,
  b.`name_ar` AS `branch_name_ar`,
  pr.`name` AS `program_name`,
  pr.`name_ar` AS `program_name_ar`,
  CONCAT(u.`first_name`, ' ', u.`last_name`) AS `parent_name`,
  u.`phone` AS `parent_phone`,
  CONCAT(c.`first_name`, ' ', c.`last_name`) AS `coach_name`,
  p.`join_date`,
  p.`created_at`
FROM `players` p
LEFT JOIN `branches` b ON p.`branch_id` = b.`id`
LEFT JOIN `programs` pr ON p.`program_id` = pr.`id`
LEFT JOIN `users` u ON p.`parent_id` = u.`id`
LEFT JOIN `users` c ON p.`coach_id` = c.`id`
WHERE p.`status` = 'active';

-- View: Payment summary by branch
CREATE OR REPLACE VIEW `v_payment_summary_by_branch` AS
SELECT
  b.`id` AS `branch_id`,
  b.`name` AS `branch_name`,
  b.`name_ar` AS `branch_name_ar`,
  COUNT(CASE WHEN pay.`status` = 'completed' THEN 1 END) AS `completed_count`,
  COUNT(CASE WHEN pay.`status` = 'pending' THEN 1 END) AS `pending_count`,
  SUM(CASE WHEN pay.`status` = 'completed' THEN pay.`total_amount` ELSE 0 END) AS `total_revenue`,
  SUM(CASE WHEN pay.`status` = 'pending' THEN pay.`total_amount` ELSE 0 END) AS `pending_amount`
FROM `branches` b
LEFT JOIN `payments` pay ON b.`id` = pay.`branch_id`
GROUP BY b.`id`, b.`name`, b.`name_ar`;

-- View: Attendance summary by program
CREATE OR REPLACE VIEW `v_attendance_summary_by_program` AS
SELECT
  pr.`id` AS `program_id`,
  pr.`name` AS `program_name`,
  pr.`name_ar` AS `program_name_ar`,
  b.`name` AS `branch_name`,
  COUNT(DISTINCT a.`player_id`) AS `total_players`,
  COUNT(a.`id`) AS `total_sessions`,
  COUNT(CASE WHEN a.`status` = 'present' THEN 1 END) AS `present_count`,
  COUNT(CASE WHEN a.`status` = 'absent' THEN 1 END) AS `absent_count`,
  COUNT(CASE WHEN a.`status` = 'late' THEN 1 END) AS `late_count`,
  ROUND(
    (COUNT(CASE WHEN a.`status` IN ('present', 'late') THEN 1 END) * 100.0) /
    NULLIF(COUNT(a.`id`), 0),
    2
  ) AS `attendance_rate`
FROM `programs` pr
LEFT JOIN `branches` b ON pr.`branch_id` = b.`id`
LEFT JOIN `attendance` a ON pr.`id` = a.`program_id`
WHERE pr.`is_active` = 1
GROUP BY pr.`id`, pr.`name`, pr.`name_ar`, b.`name`;

-- View: Subscription overview with player and program details
CREATE OR REPLACE VIEW `v_subscription_overview` AS
SELECT
  s.`id` AS `subscription_id`,
  s.`plan_type`,
  s.`start_date`,
  s.`end_date`,
  s.`status`,
  s.`amount`,
  s.`discount_amount`,
  s.`total_amount`,
  s.`is_auto_renew`,
  CONCAT(p.`first_name`, ' ', p.`last_name`) AS `player_name`,
  p.`registration_number`,
  pr.`name` AS `program_name`,
  pr.`name_ar` AS `program_name_ar`,
  b.`name` AS `branch_name`,
  CONCAT(u.`first_name`, ' ', u.`last_name`) AS `parent_name`,
  u.`phone` AS `parent_phone`,
  DATEDIFF(s.`end_date`, CURDATE()) AS `days_remaining`
FROM `subscriptions` s
JOIN `players` p ON s.`player_id` = p.`id`
JOIN `programs` pr ON s.`program_id` = pr.`id`
JOIN `branches` b ON pr.`branch_id` = b.`id`
JOIN `users` u ON p.`parent_id` = u.`id`;

-- View: Coach workload summary
CREATE OR REPLACE VIEW `v_coach_workload` AS
SELECT
  u.`id` AS `coach_id`,
  CONCAT(u.`first_name`, ' ', u.`last_name`) AS `coach_name`,
  u.`name_ar` AS `coach_name_ar`,
  b.`name` AS `branch_name`,
  COUNT(DISTINCT cp.`program_id`) AS `total_programs`,
  COUNT(DISTINCT pl.`id`) AS `total_players`,
  (SELECT COUNT(*) FROM `training_sessions` ts
   WHERE ts.`coach_id` = u.`id` AND ts.`date` >= CURDATE() AND ts.`is_cancelled` = 0
  ) AS `upcoming_sessions`
FROM `users` u
LEFT JOIN `branches` b ON u.`branch_id` = b.`id`
LEFT JOIN `coach_programs` cp ON u.`id` = cp.`coach_id`
LEFT JOIN `players` pl ON u.`id` = pl.`coach_id` AND pl.`status` = 'active'
WHERE u.`role` = 'coach' AND u.`is_active` = 1
GROUP BY u.`id`, u.`first_name`, u.`last_name`, u.`name_ar`, b.`name`;

-- View: Expense summary by branch and category
CREATE OR REPLACE VIEW `v_expense_summary` AS
SELECT
  b.`id` AS `branch_id`,
  b.`name` AS `branch_name`,
  e.`category`,
  COUNT(e.`id`) AS `expense_count`,
  SUM(e.`amount`) AS `total_amount`,
  MIN(e.`expense_date`) AS `earliest_date`,
  MAX(e.`expense_date`) AS `latest_date`
FROM `branches` b
LEFT JOIN `expenses` e ON b.`id` = e.`branch_id`
GROUP BY b.`id`, b.`name`, e.`category`;

-- ============================================================
-- STORED PROCEDURES
-- ============================================================

DELIMITER //

-- Generate player registration number: PLR-YYYY-XXXXX
CREATE PROCEDURE IF NOT EXISTS `sp_generate_registration_number`(OUT reg_number VARCHAR(50))
BEGIN
  DECLARE player_count INT;
  DECLARE current_year INT;
  SET current_year = YEAR(CURDATE());
  SELECT COUNT(*) INTO player_count FROM `players`;
  SET reg_number = CONCAT('PLR-', current_year, '-', LPAD(player_count + 1, 5, '0'));
END //

-- Generate invoice number: INV-YYYYMM-XXXXXX
CREATE PROCEDURE IF NOT EXISTS `sp_generate_invoice_number`(OUT inv_number VARCHAR(50))
BEGIN
  DECLARE payment_count INT;
  DECLARE v_year_month VARCHAR(6);
  SET v_year_month = DATE_FORMAT(CURDATE(), '%Y%m');
  SELECT COUNT(*) INTO payment_count FROM `payments`;
  SET inv_number = CONCAT('INV-', v_year_month, '-', LPAD(payment_count + 1, 6, '0'));
END //

-- Update expired subscriptions (called daily by event)
CREATE PROCEDURE IF NOT EXISTS `sp_update_expired_subscriptions`()
BEGIN
  UPDATE `subscriptions`
  SET `status` = 'expired', `updated_at` = CURRENT_TIMESTAMP
  WHERE `status` = 'active' AND `end_date` < CURDATE();
END //

-- Get branch statistics for dashboard
CREATE PROCEDURE IF NOT EXISTS `sp_get_branch_stats`(IN p_branch_id CHAR(36))
BEGIN
  SELECT
    (SELECT COUNT(*) FROM `players` WHERE `branch_id` = p_branch_id AND `status` = 'active') AS `active_players`,
    (SELECT COUNT(*) FROM `users` WHERE `branch_id` = p_branch_id AND `role` = 'coach' AND `is_active` = 1) AS `active_coaches`,
    (SELECT COUNT(*) FROM `programs` WHERE `branch_id` = p_branch_id AND `is_active` = 1) AS `active_programs`,
    (SELECT COALESCE(SUM(`total_amount`), 0) FROM `payments`
     WHERE `branch_id` = p_branch_id AND `status` = 'completed'
     AND MONTH(`paid_at`) = MONTH(CURDATE()) AND YEAR(`paid_at`) = YEAR(CURDATE())) AS `monthly_revenue`,
    (SELECT COALESCE(SUM(`amount`), 0) FROM `expenses`
     WHERE `branch_id` = p_branch_id
     AND MONTH(`expense_date`) = MONTH(CURDATE()) AND YEAR(`expense_date`) = YEAR(CURDATE())) AS `monthly_expenses`;
END //

-- Get player evaluation history
CREATE PROCEDURE IF NOT EXISTS `sp_get_player_evaluations`(IN p_player_id CHAR(36), IN p_limit INT)
BEGIN
  SELECT
    e.*,
    CONCAT(u.`first_name`, ' ', u.`last_name`) AS `coach_name`,
    ts.`date` AS `session_date`,
    pr.`name` AS `program_name`
  FROM `evaluations` e
  LEFT JOIN `users` u ON e.`coach_id` = u.`id`
  LEFT JOIN `training_sessions` ts ON e.`session_id` = ts.`id`
  LEFT JOIN `players` p ON e.`player_id` = p.`id`
  LEFT JOIN `programs` pr ON p.`program_id` = pr.`id`
  WHERE e.`player_id` = p_player_id
  ORDER BY e.`evaluation_date` DESC
  LIMIT p_limit;
END //

-- Apply subscription freeze (extends end dates)
CREATE PROCEDURE IF NOT EXISTS `sp_apply_subscription_freeze`(IN p_freeze_id CHAR(36))
BEGIN
  DECLARE v_scope VARCHAR(20);
  DECLARE v_branch_id CHAR(36);
  DECLARE v_program_id CHAR(36);
  DECLARE v_freeze_days INT;
  DECLARE v_affected INT DEFAULT 0;

  SELECT `scope`, `branch_id`, `program_id`, `freeze_days`
  INTO v_scope, v_branch_id, v_program_id, v_freeze_days
  FROM `subscription_freezes` WHERE `id` = p_freeze_id;

  IF v_scope = 'global' THEN
    UPDATE `subscriptions`
    SET `end_date` = DATE_ADD(`end_date`, INTERVAL v_freeze_days DAY),
        `updated_at` = CURRENT_TIMESTAMP
    WHERE `status` = 'active';
  ELSEIF v_scope = 'branch' THEN
    UPDATE `subscriptions` s
    JOIN `programs` pr ON s.`program_id` = pr.`id`
    SET s.`end_date` = DATE_ADD(s.`end_date`, INTERVAL v_freeze_days DAY),
        s.`updated_at` = CURRENT_TIMESTAMP
    WHERE s.`status` = 'active' AND pr.`branch_id` = v_branch_id;
  ELSEIF v_scope = 'program' THEN
    UPDATE `subscriptions`
    SET `end_date` = DATE_ADD(`end_date`, INTERVAL v_freeze_days DAY),
        `updated_at` = CURRENT_TIMESTAMP
    WHERE `status` = 'active' AND `program_id` = v_program_id;
  END IF;

  SET v_affected = ROW_COUNT();

  UPDATE `subscription_freezes`
  SET `applied` = 1, `subscriptions_affected` = v_affected, `status` = 'active'
  WHERE `id` = p_freeze_id;
END //

DELIMITER ;

-- ============================================================
-- TRIGGERS
-- ============================================================

DELIMITER //

-- Update program enrollment count when player is added
CREATE TRIGGER IF NOT EXISTS `trg_player_after_insert`
AFTER INSERT ON `players`
FOR EACH ROW
BEGIN
  IF NEW.`program_id` IS NOT NULL THEN
    UPDATE `programs`
    SET `current_enrollment` = `current_enrollment` + 1
    WHERE `id` = NEW.`program_id`;
  END IF;
END //

-- Update program enrollment count when player changes program
CREATE TRIGGER IF NOT EXISTS `trg_player_after_update`
AFTER UPDATE ON `players`
FOR EACH ROW
BEGIN
  -- Decrement old program
  IF OLD.`program_id` IS NOT NULL AND (NEW.`program_id` IS NULL OR OLD.`program_id` != NEW.`program_id`) THEN
    UPDATE `programs`
    SET `current_enrollment` = GREATEST(`current_enrollment` - 1, 0)
    WHERE `id` = OLD.`program_id`;
  END IF;
  -- Increment new program
  IF NEW.`program_id` IS NOT NULL AND (OLD.`program_id` IS NULL OR OLD.`program_id` != NEW.`program_id`) THEN
    UPDATE `programs`
    SET `current_enrollment` = `current_enrollment` + 1
    WHERE `id` = NEW.`program_id`;
  END IF;
END //

-- Update program enrollment count when player is deleted
CREATE TRIGGER IF NOT EXISTS `trg_player_after_delete`
AFTER DELETE ON `players`
FOR EACH ROW
BEGIN
  IF OLD.`program_id` IS NOT NULL THEN
    UPDATE `programs`
    SET `current_enrollment` = GREATEST(`current_enrollment` - 1, 0)
    WHERE `id` = OLD.`program_id`;
  END IF;
END //

-- Auto-set read_at timestamp when notification is marked as read
CREATE TRIGGER IF NOT EXISTS `trg_notification_before_update`
BEFORE UPDATE ON `notifications`
FOR EACH ROW
BEGIN
  IF NEW.`is_read` = 1 AND OLD.`is_read` = 0 THEN
    SET NEW.`read_at` = CURRENT_TIMESTAMP;
  END IF;
END //

-- Auto-calculate evaluation averages on insert
CREATE TRIGGER IF NOT EXISTS `trg_evaluation_before_insert`
BEFORE INSERT ON `evaluations`
FOR EACH ROW
BEGIN
  IF NEW.`evaluation_type` = 'detailed' THEN
    SET NEW.`technical_avg` = (
      COALESCE(NEW.`ball_control`, 0) + COALESCE(NEW.`passing`, 0) +
      COALESCE(NEW.`shooting`, 0) + COALESCE(NEW.`dribbling`, 0)
    ) / NULLIF(
      (NEW.`ball_control` IS NOT NULL) + (NEW.`passing` IS NOT NULL) +
      (NEW.`shooting` IS NOT NULL) + (NEW.`dribbling` IS NOT NULL), 0
    );
    SET NEW.`physical_avg` = (
      COALESCE(NEW.`speed`, 0) + COALESCE(NEW.`stamina`, 0) +
      COALESCE(NEW.`strength`, 0) + COALESCE(NEW.`agility`, 0)
    ) / NULLIF(
      (NEW.`speed` IS NOT NULL) + (NEW.`stamina` IS NOT NULL) +
      (NEW.`strength` IS NOT NULL) + (NEW.`agility` IS NOT NULL), 0
    );
    SET NEW.`mental_avg` = (
      COALESCE(NEW.`attitude`, 0) + COALESCE(NEW.`discipline`, 0) +
      COALESCE(NEW.`teamwork`, 0) + COALESCE(NEW.`effort`, 0)
    ) / NULLIF(
      (NEW.`attitude` IS NOT NULL) + (NEW.`discipline` IS NOT NULL) +
      (NEW.`teamwork` IS NOT NULL) + (NEW.`effort` IS NOT NULL), 0
    );
  END IF;
END //

-- Auto-calculate evaluation averages on update
CREATE TRIGGER IF NOT EXISTS `trg_evaluation_before_update`
BEFORE UPDATE ON `evaluations`
FOR EACH ROW
BEGIN
  IF NEW.`evaluation_type` = 'detailed' THEN
    SET NEW.`technical_avg` = (
      COALESCE(NEW.`ball_control`, 0) + COALESCE(NEW.`passing`, 0) +
      COALESCE(NEW.`shooting`, 0) + COALESCE(NEW.`dribbling`, 0)
    ) / NULLIF(
      (NEW.`ball_control` IS NOT NULL) + (NEW.`passing` IS NOT NULL) +
      (NEW.`shooting` IS NOT NULL) + (NEW.`dribbling` IS NOT NULL), 0
    );
    SET NEW.`physical_avg` = (
      COALESCE(NEW.`speed`, 0) + COALESCE(NEW.`stamina`, 0) +
      COALESCE(NEW.`strength`, 0) + COALESCE(NEW.`agility`, 0)
    ) / NULLIF(
      (NEW.`speed` IS NOT NULL) + (NEW.`stamina` IS NOT NULL) +
      (NEW.`strength` IS NOT NULL) + (NEW.`agility` IS NOT NULL), 0
    );
    SET NEW.`mental_avg` = (
      COALESCE(NEW.`attitude`, 0) + COALESCE(NEW.`discipline`, 0) +
      COALESCE(NEW.`teamwork`, 0) + COALESCE(NEW.`effort`, 0)
    ) / NULLIF(
      (NEW.`attitude` IS NOT NULL) + (NEW.`discipline` IS NOT NULL) +
      (NEW.`teamwork` IS NOT NULL) + (NEW.`effort` IS NOT NULL), 0
    );
  END IF;
END //

DELIMITER ;

-- ============================================================
-- SCHEDULED EVENTS
-- ============================================================

SET GLOBAL event_scheduler = ON;

-- Daily: Mark expired subscriptions
CREATE EVENT IF NOT EXISTS `evt_update_expired_subscriptions`
ON SCHEDULE EVERY 1 DAY
STARTS CURRENT_DATE + INTERVAL 1 DAY + INTERVAL 1 HOUR
DO
  CALL `sp_update_expired_subscriptions`();

-- Daily: Clean up OTPs older than 24 hours
CREATE EVENT IF NOT EXISTS `evt_cleanup_old_otps`
ON SCHEDULE EVERY 1 DAY
DO
  DELETE FROM `otps` WHERE `created_at` < DATE_SUB(NOW(), INTERVAL 24 HOUR);

-- Daily: Clean up expired auth sessions
CREATE EVENT IF NOT EXISTS `evt_cleanup_expired_sessions`
ON SCHEDULE EVERY 1 DAY
DO
  DELETE FROM `sessions`
  WHERE `expires_at` < NOW()
     OR (`is_active` = 0 AND `updated_at` < DATE_SUB(NOW(), INTERVAL 7 DAY));

-- Daily: Activate scheduled subscription freezes
CREATE EVENT IF NOT EXISTS `evt_activate_subscription_freezes`
ON SCHEDULE EVERY 1 DAY
STARTS CURRENT_DATE + INTERVAL 1 DAY
DO
  UPDATE `subscription_freezes`
  SET `status` = 'active'
  WHERE `status` = 'scheduled' AND `start_date` <= CURDATE();

-- Daily: Complete finished subscription freezes
CREATE EVENT IF NOT EXISTS `evt_complete_subscription_freezes`
ON SCHEDULE EVERY 1 DAY
STARTS CURRENT_DATE + INTERVAL 1 DAY
DO
  UPDATE `subscription_freezes`
  SET `status` = 'completed'
  WHERE `status` = 'active' AND `end_date` < CURDATE();

-- ============================================================
-- SCHEMA SUMMARY
-- ============================================================
-- Database: academy_asp (matches backend config)
--
-- Tables (26):
--   1.  branches                      - Academy branches/locations
--   2.  users                         - All system users
--   3.  programs                      - Training programs
--   4.  program_pricing_plans         - Custom pricing plans
--   5.  coach_programs                - Coach-Program junction
--   6.  players                       - Registered players
--   7.  subscriptions                 - Player subscriptions
--   8.  payments                      - Payment transactions
--   9.  discounts                     - Discount records
--   10. training_sessions             - Training session instances
--   11. attendance                    - Player attendance
--   12. coach_attendance              - Coach attendance
--   13. evaluations                   - Player evaluations
--   14. expenses                      - Branch expenses
--   15. waitlist                      - Program waitlist
--   16. subscription_freezes          - Subscription freeze periods
--   17. announcements                 - System-wide announcements
--   18. branch_announcements          - Branch-specific announcements
--   19. automatic_announcements       - Scheduled auto announcements
--   20. accountant_auto_announcements - Accountant auto alerts
--   21. sms_messages                  - SMS records
--   22. auto_sms_settings             - Auto SMS templates
--   23. notifications                 - User notifications
--   24. sessions                      - Auth sessions (JWT)
--   25. otps                          - One-time passwords
--   26. audit_logs                    - System audit trail
--
-- Views (6):
--   v_active_players, v_payment_summary_by_branch,
--   v_attendance_summary_by_program, v_subscription_overview,
--   v_coach_workload, v_expense_summary
--
-- Stored Procedures (6):
--   sp_generate_registration_number, sp_generate_invoice_number,
--   sp_update_expired_subscriptions, sp_get_branch_stats,
--   sp_get_player_evaluations, sp_apply_subscription_freeze
--
-- Triggers (6):
--   trg_player_after_insert, trg_player_after_update,
--   trg_player_after_delete, trg_notification_before_update,
--   trg_evaluation_before_insert, trg_evaluation_before_update
--
-- Events (5):
--   evt_update_expired_subscriptions, evt_cleanup_old_otps,
--   evt_cleanup_expired_sessions, evt_activate_subscription_freezes,
--   evt_complete_subscription_freezes
-- ============================================================
