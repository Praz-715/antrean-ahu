-- Media library menerima berkas audio (§20): nada panggil dan rekaman pengumuman
-- yang dipakai layar antrean.
--
-- Nilai baru ditambahkan DI AKHIR daftar supaya indeks ENUM baris lama tidak bergeser.
ALTER TABLE `media`
  MODIFY `type` ENUM('IMAGE', 'VIDEO', 'AUDIO') NOT NULL;
