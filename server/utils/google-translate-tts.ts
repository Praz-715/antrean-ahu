/**
 * Suara panggilan dari mesin TTS Google Translate (§22).
 *
 * Gratis dan tanpa kunci API: cukup satu permintaan GET yang mengembalikan MP3.
 * Dipakai untuk menyeragamkan suara seluruh layar — termasuk perangkat yang tidak
 * punya suara Indonesia sendiri — tanpa memasang paket bahasa di tiap televisi.
 *
 * Ditulis sendiri, bukan memakai paket `google-tts-api`: satu-satunya yang
 * dibutuhkan darinya adalah perangkaian query di bawah ini — tidak ada token atau
 * algoritma apa pun — sementara paketnya menyeret `axios` 0.21 yang bercelah tinggi
 * dan sudah tidak dirawat sejak 2022.
 *
 * Yang perlu diketahui sebelum mengandalkannya: ini jalur internal Google Translate,
 * bukan API berdokumentasi. Google bisa membatasi per alamat IP atau mengubahnya
 * tanpa pemberitahuan, dan pemakaian otomatis tidak dijamin oleh ketentuan layanan
 * Translate. Karena itu layar SELALU punya jalan mundur ke suara peramban bila
 * permintaan ini gagal — lihat `announceCall()` di halaman display.
 */

const HOST = 'https://translate.google.com'

/** Batas dari Google; endpoint TTS kita memang sudah membatasi teks di angka yang sama. */
export const GOOGLE_TTS_MAX_CHARS = 200

/**
 * Header peramban.
 *
 * Tanpa `User-Agent` yang wajar, endpoint Translate menjawab 403 — permintaan tanpa
 * identitas diperlakukan sebagai robot.
 */
export const GOOGLE_TTS_HEADERS: Record<string, string> = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  'Accept': 'audio/mpeg,audio/*;q=0.9,*/*;q=0.8',
}

/**
 * Kode bahasa yang diterima Translate: `id`, bukan `id-ID`.
 *
 * Pengaturan menyimpan bentuk BCP-47 karena itu yang dipakai Web Speech API, jadi
 * bagian wilayahnya dibuang di sini — satu-satunya tempat yang peduli.
 */
export function googleTtsLang(language: string): string {
  const kode = String(language || 'id-ID').trim().split('-')[0]!.toLowerCase()
  return /^[a-z]{2,3}$/.test(kode) ? kode : 'id'
}

/** URL MP3 untuk satu kalimat panggilan. */
export function googleTranslateTtsUrl(text: string, language: string): string {
  const bersih = text.trim()
  if (!bersih) throw new Error('Teks panggilan kosong')
  if (bersih.length > GOOGLE_TTS_MAX_CHARS) {
    throw new Error(`Teks panggilan ${bersih.length} karakter, melebihi batas ${GOOGLE_TTS_MAX_CHARS}`)
  }

  const query = new URLSearchParams({
    ie: 'UTF-8',
    q: bersih,
    tl: googleTtsLang(language),
    total: '1',
    idx: '0',
    textlen: String(bersih.length),
    // Klien lawas ini yang tidak meminta token tanda tangan.
    client: 'tw-ob',
    prev: 'input',
    ttsspeed: '1',
  })

  return `${HOST}/translate_tts?${query.toString()}`
}
