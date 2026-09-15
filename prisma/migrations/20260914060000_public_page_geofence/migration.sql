-- Pagar lokasi halaman publik (§36).
--
-- Halaman hanya bisa dibuka bila pengunjung berada dalam radius tertentu dari titik
-- yang ditentukan admin. Disimpan sebagai kolom tersendiri, bukan di dalam JSON
-- `theme`, karena ini aturan AKSES yang diperiksa server pada tiap permintaan —
-- bukan urusan tampilan.
--
-- Bawaannya mati dengan radius 1 km, sehingga halaman yang sudah terbit tidak
-- berubah perilakunya sampai admin menyalakannya sendiri.
ALTER TABLE `public_pages`
  ADD COLUMN `geofence_enabled` BOOLEAN NOT NULL DEFAULT false AFTER `max_per_ip_per_day`,
  ADD COLUMN `latitude` DOUBLE NULL AFTER `geofence_enabled`,
  ADD COLUMN `longitude` DOUBLE NULL AFTER `latitude`,
  ADD COLUMN `geofence_radius_m` INT NOT NULL DEFAULT 1000 AFTER `longitude`;
