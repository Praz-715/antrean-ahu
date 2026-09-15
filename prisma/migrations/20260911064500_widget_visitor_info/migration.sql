-- Widget data pengunjung (§19 + §18 form dinamis): nomor antrean beserta isian
-- formulir pengunjungnya, mis. "A023 — Budi Santoso".
--
-- Sama seperti COUNTER_BOARD, nilai baru ditambahkan DI AKHIR daftar supaya indeks
-- ENUM yang sudah dipakai baris lama tidak bergeser.
ALTER TABLE `display_widgets`
  MODIFY `type` ENUM(
    'CURRENT_QUEUE',
    'QUEUE_LIST',
    'CLOCK',
    'DATE',
    'LOGO',
    'IMAGE',
    'VIDEO',
    'TEXT',
    'RUNNING_TEXT',
    'ANNOUNCEMENT',
    'ORG_NAME',
    'QRCODE',
    'PLAYLIST',
    'HTML',
    'COUNTER_BOARD',
    'VISITOR_INFO'
  ) NOT NULL;
