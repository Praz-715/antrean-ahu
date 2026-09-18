-- Logo per jenis antrean, dipilih dari Media Library.
--
-- Kartu layanan di halaman publik menandai tiap layanan dengan KODE-nya ("A", "B",
-- "C"). Bagi pengunjung yang belum pernah datang, huruf itu tidak memberi petunjuk
-- apa pun tentang layanannya; lambang instansi atau ikon layanan jauh lebih cepat
-- dikenali dari seberang ruangan maupun di layar ponsel.
--
-- Disimpan sebagai RUJUKAN ke `media`, bukan URL atau berkas tersendiri: berkasnya
-- sudah dikelola Media Library lengkap dengan ukuran, tipe, dan penghapusannya.
-- Menyimpan URL berarti tautan yang menggantung begitu berkasnya diganti.
--
-- `ON DELETE SET NULL`, bukan RESTRICT: berkas yang dihapus dari Media Library
-- membuat layanannya kembali menampilkan kode — bukan menghalangi penghapusan
-- berkas, dan bukan pula meninggalkan rujukan yang menunjuk ke ketiadaan.
ALTER TABLE `queue_types`
  ADD COLUMN `logo_media_id` CHAR(26) NULL AFTER `icon`,
  ADD INDEX `queue_types_logo_media_id_idx` (`logo_media_id`),
  ADD CONSTRAINT `queue_types_logo_media_id_fkey`
    FOREIGN KEY (`logo_media_id`) REFERENCES `media` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
