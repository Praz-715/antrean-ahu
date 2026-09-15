-- Captcha geser pada pengambilan nomor antrean, dinyalakan per formulir (§36).
--
-- Menempel pada formulir, bukan pada halaman publik, karena yang dilindungi adalah
-- pengiriman isian: satu event bisa punya beberapa formulir, dan hanya yang aktif
-- yang menentukan apakah pengunjung harus menyelesaikan teka-teki.
--
-- Bawaannya mati supaya formulir yang sudah berjalan tidak berubah perilakunya.
ALTER TABLE `form_definitions`
  ADD COLUMN `require_captcha` BOOLEAN NOT NULL DEFAULT false AFTER `is_active`;
