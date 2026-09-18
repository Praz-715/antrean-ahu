-- Email akun yang dihapus dilepas, supaya alamatnya bisa dipakai akun baru.
--
-- `users.email` unik di tingkat basis data, sementara penghapusan pengguna bersifat
-- HALUS (`deleted_at`). Akibatnya alamat email milik akun yang sudah dihapus tetap
-- memegang kunci uniknya, dan membuat akun baru dengan alamat yang sama selalu
-- ditolak — padahal itu kejadian biasa: petugas berganti, email jabatannya tetap.
--
-- Yang dipilih BUKAN menghidupkan ulang akun lamanya. `audit_logs` hanya menyimpan
-- `user_id` dan mengambil nama pelakunya lewat relasi, jadi mengganti nama pada baris
-- yang sama akan menulis ulang seluruh riwayat: tindakan petugas lama akan tercatat
-- atas nama penggantinya. Pada sistem yang punya audit log, itu kerugian yang jauh
-- lebih besar daripada satu kolom tambahan.
--
-- Jadi saat dihapus, `email` dipindahkan ke kolom ini dan `email` diisi alamat parkir
-- yang pasti unik. Alamat aslinya tetap tersimpan supaya audit log masih bisa
-- menyebutkan email pelakunya, bukan alamat parkir yang tidak berarti apa-apa.
ALTER TABLE `users`
  ADD COLUMN `email_before_delete` VARCHAR(190) NULL AFTER `email`;
