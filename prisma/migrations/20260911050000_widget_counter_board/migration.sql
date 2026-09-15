-- Widget papan per loket (§19): satu kotak untuk tiap loket beserta nomor yang
-- sedang dilayaninya.
--
-- Nilai baru DITAMBAHKAN DI AKHIR daftar, bukan disisipkan di tengah. MySQL menyimpan
-- ENUM sebagai indeks, jadi menambah di akhir tidak menggeser nilai lama sama sekali
-- dan baris yang sudah ada tidak perlu ditulis ulang. Urutan tampil di antarmuka
-- diatur katalog widget (`shared/constants/widgets.ts`), bukan urutan enum ini.
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
    'COUNTER_BOARD'
  ) NOT NULL;
