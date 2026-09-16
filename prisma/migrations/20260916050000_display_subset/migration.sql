-- Layar antrean untuk BEBERAPA layanan pilihan, pada urutan yang ditentukan admin.
--
-- Sebelumnya hanya ada dua tipe: GLOBAL (semua layanan) dan QUEUE_TYPE (tepat satu).
-- Di lapangan yang paling sering dibutuhkan justru di antaranya — satu layar di lorong
-- Direktorat Pidana & Perdata, misalnya, tanpa ikut menampilkan Imigrasi.
--
-- Urutannya disimpan sebagai URUTAN LARIK di `queue_type_ids`, bukan kolom `order`
-- pada tabel penghubung. Mengikuti pola `public_pages.allowed_queue_type_ids` yang
-- sudah ada di basis data ini, dan urutan yang melekat pada lariknya tidak bisa
-- menjadi tidak konsisten — tidak ada nomor urut kembar atau bolong yang harus dijaga.
-- Harganya: tidak ada kunci asing, jadi id layanan yang sudah dihapus tetap tersimpan
-- dan disaring saat dibaca (lihat `parseQueueTypeIds`).
--
-- Keduanya aditif. Perangkat yang sudah ada tetap GLOBAL atau QUEUE_TYPE dengan
-- `queue_type_ids` NULL, dan perilakunya tidak berubah sama sekali.
ALTER TABLE `display_devices`
  MODIFY COLUMN `type` ENUM('GLOBAL', 'QUEUE_TYPE', 'SUBSET') NOT NULL DEFAULT 'GLOBAL',
  ADD COLUMN `queue_type_ids` JSON NULL AFTER `queue_type_id`;
