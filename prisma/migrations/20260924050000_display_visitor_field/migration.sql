-- Satu isian formulir yang ikut ditampilkan pada tata letak bawaan sistem.
--
-- Disimpan per PERANGKAT, bukan per event: satu layar di depan loket boleh
-- menampilkan keperluan pemohon sementara layar lobi tetap menampilkan jumlah
-- antrean menunggu. Kuncinya mengacu ke `form_fields.key`, bukan ke id barisnya,
-- karena formulir bisa disusun ulang tanpa membuat setelan layar ikut basi.
ALTER TABLE `display_devices`
  ADD COLUMN `visitor_field_key` VARCHAR(80) NULL AFTER `template_id`;
