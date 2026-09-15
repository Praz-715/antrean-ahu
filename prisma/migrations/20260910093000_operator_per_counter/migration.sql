-- Operator ditempatkan pada LOKET, dan loket menentukan layanan yang dilayani (§12, §28).
--
-- Sebelumnya satu operator bisa memegang banyak (event, jenis antrean) sekaligus,
-- sehingga "satu operator satu event" hanya bisa dijaga oleh pemeriksaan di kode.
-- Setelah migrasi ini, `operator_assignments.user_id` unique dan cakupan layanan
-- diturunkan dari loket — aturan itu dijamin database.

-- ----------------------------------------------------------------------------
-- 1. Rapikan data lama agar bisa dipetakan ke struktur baru
-- ----------------------------------------------------------------------------

-- Penugasan tanpa loket tidak punya padanan pada struktur baru.
DELETE FROM `operator_assignments` WHERE `counter_id` IS NULL;

-- Sisakan satu baris per operator (id ULID terkecil = penugasan paling awal).
DELETE `a` FROM `operator_assignments` `a`
  JOIN `operator_assignments` `b`
    ON `a`.`user_id` = `b`.`user_id` AND `a`.`id` > `b`.`id`;

-- ----------------------------------------------------------------------------
-- 2. Bentuk ulang operator_assignments
-- ----------------------------------------------------------------------------

-- FK user_id ikut dilepas dulu: MySQL memakai indeks (user_id, queue_type_id)
-- untuk menopang FK itu, sehingga indeksnya tidak bisa dibuang selama FK masih ada.
ALTER TABLE `operator_assignments` DROP FOREIGN KEY `operator_assignments_counter_id_fkey`;
ALTER TABLE `operator_assignments` DROP FOREIGN KEY `operator_assignments_event_id_fkey`;
ALTER TABLE `operator_assignments` DROP FOREIGN KEY `operator_assignments_queue_type_id_fkey`;
ALTER TABLE `operator_assignments` DROP FOREIGN KEY `operator_assignments_user_id_fkey`;

DROP INDEX `operator_assignments_event_id_idx` ON `operator_assignments`;
DROP INDEX `operator_assignments_queue_type_id_idx` ON `operator_assignments`;
DROP INDEX `operator_assignments_user_id_queue_type_id_key` ON `operator_assignments`;

ALTER TABLE `operator_assignments`
  DROP COLUMN `event_id`,
  DROP COLUMN `is_default`,
  DROP COLUMN `queue_type_id`,
  MODIFY `counter_id` CHAR(26) NOT NULL;

CREATE UNIQUE INDEX `operator_assignments_user_id_key` ON `operator_assignments`(`user_id`);

ALTER TABLE `operator_assignments` ADD CONSTRAINT `operator_assignments_user_id_fkey`
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `operator_assignments` ADD CONSTRAINT `operator_assignments_counter_id_fkey`
  FOREIGN KEY (`counter_id`) REFERENCES `counters`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- ----------------------------------------------------------------------------
-- 3. Layanan yang dilayani tiap loket
-- ----------------------------------------------------------------------------

CREATE TABLE `counter_services` (
    `id` CHAR(26) NOT NULL,
    `counter_id` CHAR(26) NOT NULL,
    `queue_type_id` CHAR(26) NOT NULL,
    `display_order` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `counter_services_queue_type_id_idx`(`queue_type_id`),
    UNIQUE INDEX `counter_services_counter_id_queue_type_id_key`(`counter_id`, `queue_type_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `counter_services` ADD CONSTRAINT `counter_services_counter_id_fkey`
  FOREIGN KEY (`counter_id`) REFERENCES `counters`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `counter_services` ADD CONSTRAINT `counter_services_queue_type_id_fkey`
  FOREIGN KEY (`queue_type_id`) REFERENCES `queue_types`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
