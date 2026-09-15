-- CreateTable
CREATE TABLE `organizations` (
    `id` CHAR(26) NOT NULL,
    `name` VARCHAR(150) NOT NULL,
    `slug` VARCHAR(150) NOT NULL,
    `logo_url` VARCHAR(500) NULL,
    `timezone` VARCHAR(64) NOT NULL DEFAULT 'Asia/Jakarta',
    `settings` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `organizations_slug_key`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `users` (
    `id` CHAR(26) NOT NULL,
    `organization_id` CHAR(26) NULL,
    `name` VARCHAR(150) NOT NULL,
    `email` VARCHAR(190) NOT NULL,
    `email_verified` BOOLEAN NOT NULL DEFAULT false,
    `image` VARCHAR(500) NULL,
    `username` VARCHAR(60) NULL,
    `phone` VARCHAR(30) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `last_login_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `users_organization_id_idx`(`organization_id`),
    UNIQUE INDEX `users_email_key`(`email`),
    UNIQUE INDEX `users_organization_id_username_key`(`organization_id`, `username`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sessions` (
    `id` CHAR(26) NOT NULL,
    `user_id` CHAR(26) NOT NULL,
    `token` VARCHAR(255) NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `ip_address` VARCHAR(64) NULL,
    `user_agent` VARCHAR(500) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `sessions_token_key`(`token`),
    INDEX `sessions_user_id_idx`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `accounts` (
    `id` CHAR(26) NOT NULL,
    `user_id` CHAR(26) NOT NULL,
    `account_id` VARCHAR(255) NOT NULL,
    `provider_id` VARCHAR(64) NOT NULL,
    `access_token` TEXT NULL,
    `refresh_token` TEXT NULL,
    `id_token` TEXT NULL,
    `access_token_expires_at` DATETIME(3) NULL,
    `refresh_token_expires_at` DATETIME(3) NULL,
    `scope` VARCHAR(500) NULL,
    `password` VARCHAR(255) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `accounts_user_id_idx`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `verifications` (
    `id` CHAR(26) NOT NULL,
    `identifier` VARCHAR(255) NOT NULL,
    `value` TEXT NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `verifications_identifier_idx`(`identifier`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `roles` (
    `id` CHAR(26) NOT NULL,
    `organization_id` CHAR(26) NULL,
    `key` VARCHAR(60) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `description` VARCHAR(255) NULL,
    `is_system` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `roles_organization_id_key_key`(`organization_id`, `key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `permissions` (
    `id` CHAR(26) NOT NULL,
    `key` VARCHAR(80) NOT NULL,
    `group` VARCHAR(60) NOT NULL,
    `description` VARCHAR(255) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `permissions_key_key`(`key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `role_permissions` (
    `role_id` CHAR(26) NOT NULL,
    `permission_id` CHAR(26) NOT NULL,

    INDEX `role_permissions_permission_id_idx`(`permission_id`),
    PRIMARY KEY (`role_id`, `permission_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_roles` (
    `user_id` CHAR(26) NOT NULL,
    `role_id` CHAR(26) NOT NULL,

    INDEX `user_roles_role_id_idx`(`role_id`),
    PRIMARY KEY (`user_id`, `role_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `events` (
    `id` CHAR(26) NOT NULL,
    `organization_id` CHAR(26) NOT NULL,
    `name` VARCHAR(150) NOT NULL,
    `slug` VARCHAR(150) NOT NULL,
    `description` TEXT NULL,
    `status` ENUM('DRAFT', 'SCHEDULED', 'OPEN', 'PAUSED', 'CLOSED', 'COMPLETED') NOT NULL DEFAULT 'DRAFT',
    `timezone` VARCHAR(64) NOT NULL DEFAULT 'Asia/Jakarta',
    `start_date` DATE NULL,
    `end_date` DATE NULL,
    `branding` JSON NULL,
    `settings` JSON NULL,
    `allow_finish_after_close` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `events_status_idx`(`status`),
    UNIQUE INDEX `events_organization_id_slug_key`(`organization_id`, `slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `event_schedules` (
    `id` CHAR(26) NOT NULL,
    `event_id` CHAR(26) NOT NULL,
    `day_of_week` TINYINT NOT NULL,
    `open_time` VARCHAR(5) NOT NULL,
    `close_time` VARCHAR(5) NOT NULL,
    `is_closed` BOOLEAN NOT NULL DEFAULT false,
    `override_date` DATE NULL,
    `note` VARCHAR(255) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `event_schedules_event_id_idx`(`event_id`),
    UNIQUE INDEX `event_schedules_event_id_day_of_week_override_date_key`(`event_id`, `day_of_week`, `override_date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `queue_types` (
    `id` CHAR(26) NOT NULL,
    `event_id` CHAR(26) NOT NULL,
    `code` VARCHAR(20) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `description` VARCHAR(500) NULL,
    `prefix` VARCHAR(10) NOT NULL,
    `starting_number` INTEGER NOT NULL DEFAULT 1,
    `number_format` VARCHAR(50) NOT NULL DEFAULT '{prefix}{seq}',
    `padding` INTEGER NOT NULL DEFAULT 3,
    `color` VARCHAR(20) NOT NULL DEFAULT '#2563eb',
    `icon` VARCHAR(60) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `display_order` INTEGER NOT NULL DEFAULT 0,
    `max_waiting` INTEGER NULL,
    `est_service_seconds` INTEGER NOT NULL DEFAULT 480,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `queue_types_event_id_is_active_idx`(`event_id`, `is_active`),
    UNIQUE INDEX `queue_types_event_id_code_key`(`event_id`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `counters` (
    `id` CHAR(26) NOT NULL,
    `event_id` CHAR(26) NOT NULL,
    `code` VARCHAR(20) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `display_order` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `counters_event_id_code_key`(`event_id`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `queue_counters` (
    `id` CHAR(26) NOT NULL,
    `event_id` CHAR(26) NOT NULL,
    `queue_type_id` CHAR(26) NOT NULL,
    `service_date` DATE NOT NULL,
    `current_number` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `queue_counters_queue_type_id_idx`(`queue_type_id`),
    UNIQUE INDEX `queue_counters_event_id_queue_type_id_service_date_key`(`event_id`, `queue_type_id`, `service_date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `queues` (
    `id` CHAR(26) NOT NULL,
    `organization_id` CHAR(26) NOT NULL,
    `event_id` CHAR(26) NOT NULL,
    `queue_type_id` CHAR(26) NOT NULL,
    `visitor_id` CHAR(26) NULL,
    `service_date` DATE NOT NULL,
    `sequence_number` INTEGER NOT NULL,
    `queue_number` VARCHAR(32) NOT NULL,
    `status` ENUM('WAITING', 'CALLED', 'SERVING', 'SKIPPED', 'COMPLETED', 'CANCELLED', 'NO_SHOW') NOT NULL DEFAULT 'WAITING',
    `priority` INTEGER NOT NULL DEFAULT 0,
    `public_token` VARCHAR(64) NOT NULL,
    `operator_id` CHAR(26) NULL,
    `counter_id` CHAR(26) NULL,
    `recall_count` INTEGER NOT NULL DEFAULT 0,
    `called_at` DATETIME(3) NULL,
    `last_called_at` DATETIME(3) NULL,
    `serving_started_at` DATETIME(3) NULL,
    `finished_at` DATETIME(3) NULL,
    `waiting_seconds` INTEGER NULL,
    `service_seconds` INTEGER NULL,
    `source` ENUM('PUBLIC', 'KIOSK', 'OPERATOR', 'API') NOT NULL DEFAULT 'PUBLIC',
    `note` VARCHAR(500) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `queues_public_token_key`(`public_token`),
    INDEX `queue_next_lookup`(`event_id`, `queue_type_id`, `service_date`, `status`, `sequence_number`),
    INDEX `queues_event_id_service_date_status_idx`(`event_id`, `service_date`, `status`),
    INDEX `queues_operator_id_idx`(`operator_id`),
    INDEX `queues_visitor_id_idx`(`visitor_id`),
    INDEX `queues_counter_id_idx`(`counter_id`),
    INDEX `queues_created_at_idx`(`created_at`),
    UNIQUE INDEX `queues_event_id_queue_type_id_service_date_sequence_number_key`(`event_id`, `queue_type_id`, `service_date`, `sequence_number`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `queue_events` (
    `id` CHAR(26) NOT NULL,
    `queue_id` CHAR(26) NOT NULL,
    `event_type` VARCHAR(40) NOT NULL,
    `previous_status` ENUM('WAITING', 'CALLED', 'SERVING', 'SKIPPED', 'COMPLETED', 'CANCELLED', 'NO_SHOW') NULL,
    `new_status` ENUM('WAITING', 'CALLED', 'SERVING', 'SKIPPED', 'COMPLETED', 'CANCELLED', 'NO_SHOW') NULL,
    `operator_id` CHAR(26) NULL,
    `metadata` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `queue_events_queue_id_created_at_idx`(`queue_id`, `created_at`),
    INDEX `queue_events_operator_id_idx`(`operator_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `operator_assignments` (
    `id` CHAR(26) NOT NULL,
    `user_id` CHAR(26) NOT NULL,
    `event_id` CHAR(26) NOT NULL,
    `queue_type_id` CHAR(26) NOT NULL,
    `counter_id` CHAR(26) NULL,
    `is_default` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `operator_assignments_queue_type_id_idx`(`queue_type_id`),
    INDEX `operator_assignments_event_id_idx`(`event_id`),
    INDEX `operator_assignments_counter_id_idx`(`counter_id`),
    UNIQUE INDEX `operator_assignments_user_id_queue_type_id_key`(`user_id`, `queue_type_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `visitors` (
    `id` CHAR(26) NOT NULL,
    `organization_id` CHAR(26) NOT NULL,
    `event_id` CHAR(26) NOT NULL,
    `full_name` VARCHAR(150) NULL,
    `phone` VARCHAR(30) NULL,
    `email` VARCHAR(190) NULL,
    `identity_number` VARCHAR(60) NULL,
    `data` JSON NULL,
    `ip_address` VARCHAR(64) NULL,
    `user_agent` VARCHAR(500) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `visitors_event_id_created_at_idx`(`event_id`, `created_at`),
    INDEX `visitors_phone_idx`(`phone`),
    INDEX `visitors_identity_number_idx`(`identity_number`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `form_definitions` (
    `id` CHAR(26) NOT NULL,
    `event_id` CHAR(26) NOT NULL,
    `name` VARCHAR(150) NOT NULL,
    `description` VARCHAR(500) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `data_source_id` CHAR(26) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `form_definitions_event_id_is_active_idx`(`event_id`, `is_active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `form_fields` (
    `id` CHAR(26) NOT NULL,
    `form_definition_id` CHAR(26) NOT NULL,
    `label` VARCHAR(150) NOT NULL,
    `key` VARCHAR(60) NOT NULL,
    `type` ENUM('TEXT', 'TEXTAREA', 'NUMBER', 'PHONE', 'EMAIL', 'DATE', 'DATETIME', 'SELECT', 'RADIO', 'CHECKBOX', 'FILE', 'HIDDEN') NOT NULL DEFAULT 'TEXT',
    `placeholder` VARCHAR(190) NULL,
    `help_text` VARCHAR(255) NULL,
    `is_required` BOOLEAN NOT NULL DEFAULT false,
    `validation` JSON NULL,
    `default_value` VARCHAR(255) NULL,
    `options` JSON NULL,
    `display_order` INTEGER NOT NULL DEFAULT 0,
    `visibility` JSON NULL,
    `autofill_key` VARCHAR(60) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `form_fields_form_definition_id_display_order_idx`(`form_definition_id`, `display_order`),
    UNIQUE INDEX `form_fields_form_definition_id_key_key`(`form_definition_id`, `key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `visitor_field_values` (
    `id` CHAR(26) NOT NULL,
    `visitor_id` CHAR(26) NOT NULL,
    `form_field_id` CHAR(26) NULL,
    `field_key` VARCHAR(60) NOT NULL,
    `value_text` TEXT NULL,
    `value_number` DECIMAL(18, 4) NULL,
    `value_date` DATETIME(3) NULL,
    `value_json` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `visitor_field_values_visitor_id_idx`(`visitor_id`),
    INDEX `visitor_field_values_field_key_idx`(`field_key`),
    INDEX `visitor_field_values_form_field_id_idx`(`form_field_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `data_sources` (
    `id` CHAR(26) NOT NULL,
    `organization_id` CHAR(26) NOT NULL,
    `name` VARCHAR(150) NOT NULL,
    `type` ENUM('REST', 'JSON', 'DB_READONLY', 'WEBHOOK') NOT NULL DEFAULT 'REST',
    `base_url` VARCHAR(500) NOT NULL,
    `http_method` VARCHAR(10) NOT NULL DEFAULT 'GET',
    `auth_type` ENUM('NONE', 'API_KEY', 'BEARER', 'BASIC') NOT NULL DEFAULT 'NONE',
    `credentials_cipher` LONGBLOB NULL,
    `key_version` INTEGER NOT NULL DEFAULT 1,
    `headers` JSON NULL,
    `query_template` JSON NULL,
    `timeout_ms` INTEGER NOT NULL DEFAULT 5000,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `data_sources_organization_id_is_active_idx`(`organization_id`, `is_active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `data_source_mappings` (
    `id` CHAR(26) NOT NULL,
    `data_source_id` CHAR(26) NOT NULL,
    `source_path` VARCHAR(255) NOT NULL,
    `target_field_key` VARCHAR(60) NOT NULL,
    `transform` VARCHAR(60) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `data_source_mappings_data_source_id_idx`(`data_source_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `public_pages` (
    `id` CHAR(26) NOT NULL,
    `event_id` CHAR(26) NOT NULL,
    `publish_code` VARCHAR(40) NOT NULL,
    `slug` VARCHAR(120) NULL,
    `title` VARCHAR(150) NOT NULL,
    `subtitle` VARCHAR(190) NULL,
    `description` TEXT NULL,
    `logo_url` VARCHAR(500) NULL,
    `background_url` VARCHAR(500) NULL,
    `theme` JSON NULL,
    `info_html` TEXT NULL,
    `is_published` BOOLEAN NOT NULL DEFAULT false,
    `allowed_queue_type_ids` JSON NULL,
    `require_captcha` BOOLEAN NOT NULL DEFAULT false,
    `max_per_ip_per_day` INTEGER NOT NULL DEFAULT 5,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `public_pages_publish_code_key`(`publish_code`),
    UNIQUE INDEX `public_pages_slug_key`(`slug`),
    INDEX `public_pages_event_id_idx`(`event_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `qr_codes` (
    `id` CHAR(26) NOT NULL,
    `public_page_id` CHAR(26) NOT NULL,
    `code` VARCHAR(40) NOT NULL,
    `target_url` VARCHAR(500) NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `png_path` VARCHAR(500) NULL,
    `svg_path` VARCHAR(500) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `qr_codes_public_page_id_is_active_idx`(`public_page_id`, `is_active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `display_devices` (
    `id` CHAR(26) NOT NULL,
    `event_id` CHAR(26) NOT NULL,
    `device_code` VARCHAR(40) NOT NULL,
    `device_token_hash` VARCHAR(128) NULL,
    `name` VARCHAR(150) NOT NULL,
    `type` ENUM('GLOBAL', 'QUEUE_TYPE') NOT NULL DEFAULT 'GLOBAL',
    `queue_type_id` CHAR(26) NULL,
    `template_id` CHAR(26) NULL,
    `status` ENUM('UNPAIRED', 'ONLINE', 'OFFLINE') NOT NULL DEFAULT 'UNPAIRED',
    `last_seen_at` DATETIME(3) NULL,
    `last_ip` VARCHAR(64) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `display_devices_device_code_key`(`device_code`),
    INDEX `display_devices_event_id_idx`(`event_id`),
    INDEX `display_devices_queue_type_id_idx`(`queue_type_id`),
    INDEX `display_devices_template_id_idx`(`template_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `display_templates` (
    `id` CHAR(26) NOT NULL,
    `organization_id` CHAR(26) NOT NULL,
    `event_id` CHAR(26) NULL,
    `name` VARCHAR(150) NOT NULL,
    `type` ENUM('GLOBAL', 'QUEUE_TYPE') NOT NULL DEFAULT 'GLOBAL',
    `canvas_width` INTEGER NOT NULL DEFAULT 1920,
    `canvas_height` INTEGER NOT NULL DEFAULT 1080,
    `background` JSON NULL,
    `settings` JSON NULL,
    `is_default` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `display_templates_organization_id_type_idx`(`organization_id`, `type`),
    INDEX `display_templates_event_id_idx`(`event_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `display_widgets` (
    `id` CHAR(26) NOT NULL,
    `template_id` CHAR(26) NOT NULL,
    `type` ENUM('CURRENT_QUEUE', 'QUEUE_LIST', 'CLOCK', 'DATE', 'LOGO', 'IMAGE', 'VIDEO', 'TEXT', 'RUNNING_TEXT', 'ANNOUNCEMENT', 'ORG_NAME', 'QRCODE', 'PLAYLIST', 'HTML') NOT NULL,
    `x` INTEGER NOT NULL DEFAULT 0,
    `y` INTEGER NOT NULL DEFAULT 0,
    `width` INTEGER NOT NULL DEFAULT 300,
    `height` INTEGER NOT NULL DEFAULT 200,
    `z_index` INTEGER NOT NULL DEFAULT 1,
    `config` JSON NULL,
    `style` JSON NULL,
    `animation` VARCHAR(40) NULL,
    `is_visible` BOOLEAN NOT NULL DEFAULT true,
    `media_id` CHAR(26) NULL,
    `playlist_id` CHAR(26) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `display_widgets_template_id_z_index_idx`(`template_id`, `z_index`),
    INDEX `display_widgets_media_id_idx`(`media_id`),
    INDEX `display_widgets_playlist_id_idx`(`playlist_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `media` (
    `id` CHAR(26) NOT NULL,
    `organization_id` CHAR(26) NOT NULL,
    `name` VARCHAR(190) NOT NULL,
    `type` ENUM('IMAGE', 'VIDEO') NOT NULL DEFAULT 'IMAGE',
    `mime` VARCHAR(100) NOT NULL,
    `file_path` VARCHAR(500) NOT NULL,
    `size_bytes` INTEGER NOT NULL,
    `width` INTEGER NULL,
    `height` INTEGER NULL,
    `duration_seconds` INTEGER NULL,
    `thumbnail_path` VARCHAR(500) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `uploaded_by` CHAR(26) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `media_organization_id_type_idx`(`organization_id`, `type`),
    INDEX `media_uploaded_by_idx`(`uploaded_by`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `playlists` (
    `id` CHAR(26) NOT NULL,
    `organization_id` CHAR(26) NOT NULL,
    `name` VARCHAR(150) NOT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `playlists_organization_id_idx`(`organization_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `playlist_items` (
    `id` CHAR(26) NOT NULL,
    `playlist_id` CHAR(26) NOT NULL,
    `media_id` CHAR(26) NOT NULL,
    `display_order` INTEGER NOT NULL DEFAULT 0,
    `duration_seconds` INTEGER NOT NULL DEFAULT 10,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `playlist_items_playlist_id_display_order_idx`(`playlist_id`, `display_order`),
    INDEX `playlist_items_media_id_idx`(`media_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `announcements` (
    `id` CHAR(26) NOT NULL,
    `event_id` CHAR(26) NOT NULL,
    `title` VARCHAR(190) NULL,
    `message` TEXT NOT NULL,
    `type` ENUM('TEXT', 'RUNNING_TEXT') NOT NULL DEFAULT 'RUNNING_TEXT',
    `priority` INTEGER NOT NULL DEFAULT 0,
    `starts_at` DATETIME(3) NULL,
    `ends_at` DATETIME(3) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `announcements_event_id_is_active_starts_at_idx`(`event_id`, `is_active`, `starts_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `testimonials` (
    `id` CHAR(26) NOT NULL,
    `queue_id` CHAR(26) NOT NULL,
    `visitor_id` CHAR(26) NULL,
    `event_id` CHAR(26) NOT NULL,
    `rating` TINYINT NOT NULL,
    `comment` TEXT NULL,
    `is_approved` BOOLEAN NOT NULL DEFAULT false,
    `approved_by` CHAR(26) NULL,
    `approved_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `testimonials_queue_id_key`(`queue_id`),
    INDEX `testimonials_event_id_is_approved_idx`(`event_id`, `is_approved`),
    INDEX `testimonials_visitor_id_idx`(`visitor_id`),
    INDEX `testimonials_approved_by_idx`(`approved_by`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `audit_logs` (
    `id` CHAR(26) NOT NULL,
    `organization_id` CHAR(26) NULL,
    `user_id` CHAR(26) NULL,
    `action` VARCHAR(60) NOT NULL,
    `entity` VARCHAR(60) NOT NULL,
    `entity_id` CHAR(26) NULL,
    `old_data` JSON NULL,
    `new_data` JSON NULL,
    `ip_address` VARCHAR(64) NULL,
    `user_agent` VARCHAR(500) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `audit_logs_organization_id_created_at_idx`(`organization_id`, `created_at`),
    INDEX `audit_logs_entity_entity_id_idx`(`entity`, `entity_id`),
    INDEX `audit_logs_user_id_idx`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `system_settings` (
    `id` CHAR(26) NOT NULL,
    `organization_id` CHAR(26) NULL,
    `key` VARCHAR(80) NOT NULL,
    `value` JSON NULL,
    `updated_by` CHAR(26) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `system_settings_updated_by_idx`(`updated_by`),
    UNIQUE INDEX `system_settings_organization_id_key_key`(`organization_id`, `key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `notifications` (
    `id` CHAR(26) NOT NULL,
    `organization_id` CHAR(26) NULL,
    `user_id` CHAR(26) NULL,
    `channel` ENUM('DISPLAY', 'BROWSER', 'EMAIL', 'WHATSAPP', 'SMS') NOT NULL DEFAULT 'DISPLAY',
    `type` VARCHAR(60) NOT NULL,
    `payload` JSON NULL,
    `status` ENUM('PENDING', 'SENT', 'FAILED') NOT NULL DEFAULT 'PENDING',
    `sent_at` DATETIME(3) NULL,
    `error` VARCHAR(500) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `notifications_status_created_at_idx`(`status`, `created_at`),
    INDEX `notifications_user_id_idx`(`user_id`),
    INDEX `notifications_organization_id_idx`(`organization_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `export_jobs` (
    `id` CHAR(26) NOT NULL,
    `requested_by` CHAR(26) NOT NULL,
    `type` VARCHAR(60) NOT NULL,
    `filters` JSON NULL,
    `format` ENUM('CSV', 'XLSX', 'PDF') NOT NULL DEFAULT 'CSV',
    `status` ENUM('QUEUED', 'PROCESSING', 'DONE', 'FAILED') NOT NULL DEFAULT 'QUEUED',
    `file_path` VARCHAR(500) NULL,
    `row_count` INTEGER NULL,
    `error` VARCHAR(500) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `export_jobs_requested_by_created_at_idx`(`requested_by`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `users` ADD CONSTRAINT `users_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sessions` ADD CONSTRAINT `sessions_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `accounts` ADD CONSTRAINT `accounts_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `roles` ADD CONSTRAINT `roles_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `role_permissions` ADD CONSTRAINT `role_permissions_role_id_fkey` FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `role_permissions` ADD CONSTRAINT `role_permissions_permission_id_fkey` FOREIGN KEY (`permission_id`) REFERENCES `permissions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_roles` ADD CONSTRAINT `user_roles_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_roles` ADD CONSTRAINT `user_roles_role_id_fkey` FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `events` ADD CONSTRAINT `events_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `event_schedules` ADD CONSTRAINT `event_schedules_event_id_fkey` FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `queue_types` ADD CONSTRAINT `queue_types_event_id_fkey` FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `counters` ADD CONSTRAINT `counters_event_id_fkey` FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `queue_counters` ADD CONSTRAINT `queue_counters_event_id_fkey` FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `queue_counters` ADD CONSTRAINT `queue_counters_queue_type_id_fkey` FOREIGN KEY (`queue_type_id`) REFERENCES `queue_types`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `queues` ADD CONSTRAINT `queues_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `queues` ADD CONSTRAINT `queues_event_id_fkey` FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `queues` ADD CONSTRAINT `queues_queue_type_id_fkey` FOREIGN KEY (`queue_type_id`) REFERENCES `queue_types`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `queues` ADD CONSTRAINT `queues_visitor_id_fkey` FOREIGN KEY (`visitor_id`) REFERENCES `visitors`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `queues` ADD CONSTRAINT `queues_operator_id_fkey` FOREIGN KEY (`operator_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `queues` ADD CONSTRAINT `queues_counter_id_fkey` FOREIGN KEY (`counter_id`) REFERENCES `counters`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `queue_events` ADD CONSTRAINT `queue_events_queue_id_fkey` FOREIGN KEY (`queue_id`) REFERENCES `queues`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `queue_events` ADD CONSTRAINT `queue_events_operator_id_fkey` FOREIGN KEY (`operator_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `operator_assignments` ADD CONSTRAINT `operator_assignments_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `operator_assignments` ADD CONSTRAINT `operator_assignments_event_id_fkey` FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `operator_assignments` ADD CONSTRAINT `operator_assignments_queue_type_id_fkey` FOREIGN KEY (`queue_type_id`) REFERENCES `queue_types`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `operator_assignments` ADD CONSTRAINT `operator_assignments_counter_id_fkey` FOREIGN KEY (`counter_id`) REFERENCES `counters`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `visitors` ADD CONSTRAINT `visitors_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `visitors` ADD CONSTRAINT `visitors_event_id_fkey` FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `form_definitions` ADD CONSTRAINT `form_definitions_event_id_fkey` FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `form_definitions` ADD CONSTRAINT `form_definitions_data_source_id_fkey` FOREIGN KEY (`data_source_id`) REFERENCES `data_sources`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `form_fields` ADD CONSTRAINT `form_fields_form_definition_id_fkey` FOREIGN KEY (`form_definition_id`) REFERENCES `form_definitions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `visitor_field_values` ADD CONSTRAINT `visitor_field_values_visitor_id_fkey` FOREIGN KEY (`visitor_id`) REFERENCES `visitors`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `visitor_field_values` ADD CONSTRAINT `visitor_field_values_form_field_id_fkey` FOREIGN KEY (`form_field_id`) REFERENCES `form_fields`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `data_sources` ADD CONSTRAINT `data_sources_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `data_source_mappings` ADD CONSTRAINT `data_source_mappings_data_source_id_fkey` FOREIGN KEY (`data_source_id`) REFERENCES `data_sources`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `public_pages` ADD CONSTRAINT `public_pages_event_id_fkey` FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `qr_codes` ADD CONSTRAINT `qr_codes_public_page_id_fkey` FOREIGN KEY (`public_page_id`) REFERENCES `public_pages`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `display_devices` ADD CONSTRAINT `display_devices_event_id_fkey` FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `display_devices` ADD CONSTRAINT `display_devices_queue_type_id_fkey` FOREIGN KEY (`queue_type_id`) REFERENCES `queue_types`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `display_devices` ADD CONSTRAINT `display_devices_template_id_fkey` FOREIGN KEY (`template_id`) REFERENCES `display_templates`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `display_templates` ADD CONSTRAINT `display_templates_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `display_templates` ADD CONSTRAINT `display_templates_event_id_fkey` FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `display_widgets` ADD CONSTRAINT `display_widgets_template_id_fkey` FOREIGN KEY (`template_id`) REFERENCES `display_templates`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `display_widgets` ADD CONSTRAINT `display_widgets_media_id_fkey` FOREIGN KEY (`media_id`) REFERENCES `media`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `display_widgets` ADD CONSTRAINT `display_widgets_playlist_id_fkey` FOREIGN KEY (`playlist_id`) REFERENCES `playlists`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `media` ADD CONSTRAINT `media_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `media` ADD CONSTRAINT `media_uploaded_by_fkey` FOREIGN KEY (`uploaded_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `playlists` ADD CONSTRAINT `playlists_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `playlist_items` ADD CONSTRAINT `playlist_items_playlist_id_fkey` FOREIGN KEY (`playlist_id`) REFERENCES `playlists`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `playlist_items` ADD CONSTRAINT `playlist_items_media_id_fkey` FOREIGN KEY (`media_id`) REFERENCES `media`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `announcements` ADD CONSTRAINT `announcements_event_id_fkey` FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `testimonials` ADD CONSTRAINT `testimonials_queue_id_fkey` FOREIGN KEY (`queue_id`) REFERENCES `queues`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `testimonials` ADD CONSTRAINT `testimonials_visitor_id_fkey` FOREIGN KEY (`visitor_id`) REFERENCES `visitors`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `testimonials` ADD CONSTRAINT `testimonials_event_id_fkey` FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `testimonials` ADD CONSTRAINT `testimonials_approved_by_fkey` FOREIGN KEY (`approved_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `system_settings` ADD CONSTRAINT `system_settings_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `system_settings` ADD CONSTRAINT `system_settings_updated_by_fkey` FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `export_jobs` ADD CONSTRAINT `export_jobs_requested_by_fkey` FOREIGN KEY (`requested_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
