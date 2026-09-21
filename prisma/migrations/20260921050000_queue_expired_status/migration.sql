-- Status baru: nomor yang hangus karena sudah dilewati sekian nomor.
--
-- Dipisahkan dari NO_SHOW: "tidak hadir saat dipanggil" dan "hangus karena
-- terlewat" adalah dua kejadian berbeda, dan laporan harian memisahkan keduanya.
ALTER TABLE `queues`
  MODIFY COLUMN `status` ENUM('WAITING', 'CALLED', 'SERVING', 'SKIPPED', 'COMPLETED', 'CANCELLED', 'NO_SHOW', 'EXPIRED') NOT NULL DEFAULT 'WAITING';

ALTER TABLE `queue_events`
  MODIFY COLUMN `previous_status` ENUM('WAITING', 'CALLED', 'SERVING', 'SKIPPED', 'COMPLETED', 'CANCELLED', 'NO_SHOW', 'EXPIRED') NULL,
  MODIFY COLUMN `new_status` ENUM('WAITING', 'CALLED', 'SERVING', 'SKIPPED', 'COMPLETED', 'CANCELLED', 'NO_SHOW', 'EXPIRED') NULL;
