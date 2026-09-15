/**
 * Header keamanan untuk seluruh respons (§36).
 *
 * Dipasang sebagai middleware, bukan konfigurasi server web, supaya perlindungannya
 * ikut ke mana pun aplikasi ini dijalankan — termasuk saat dev, di mana kesalahan
 * paling sering ditemukan.
 */

const isProduction = process.env.NODE_ENV === 'production'

/**
 * Content-Security-Policy.
 *
 * `'unsafe-inline'` pada script masih diperlukan: Nuxt menyisipkan payload SSR
 * sebagai skrip inline. Nilainya tetap ada gunanya — sumber skrip dari domain lain
 * tetap ditolak, dan itulah jalur yang dipakai kebanyakan serangan injeksi.
 */
function buildCsp() {
  const turnstile = process.env.TURNSTILE_SITE_KEY ? ' https://challenges.cloudflare.com' : ''

  return [
    `default-src 'self'`,
    `base-uri 'self'`,
    `object-src 'none'`,
    `frame-ancestors 'self'`,
    `form-action 'self'`,
    `img-src 'self' data: blob:`,
    `media-src 'self' blob:`,
    `font-src 'self' data:`,
    `style-src 'self' 'unsafe-inline'`,
    `script-src 'self' 'unsafe-inline'${turnstile}`,
    `frame-src 'self'${turnstile}`,
    // WebSocket realtime memakai origin yang sama; ws: dibutuhkan saat dev (http).
    `connect-src 'self' ws: wss:`,
    ...(isProduction ? ['upgrade-insecure-requests'] : []),
  ].join('; ')
}

const CSP = buildCsp()

export default defineEventHandler((event) => {
  /**
   * Geolocation dibuka HANYA pada halaman yang memang memakainya.
   *
   * Pagar lokasi halaman publik (§36) meminta lokasi pengunjung, dan builder punya
   * tombol "Lokasi saya" untuk menentukan titiknya. Di luar dua jalur itu aksesnya
   * tetap ditutup rapat — termasuk untuk iframe mana pun, karena `(self)` hanya
   * mengizinkan dokumen dengan asal yang sama.
   */
  const perluLokasi = event.path.startsWith('/p/') || event.path.startsWith('/admin/public-pages')
  const izinLokasi = perluLokasi ? 'geolocation=(self)' : 'geolocation=()'

  setResponseHeaders(event, {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': `camera=(), microphone=(), ${izinLokasi}, interest-cohort=()`,
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Content-Security-Policy': CSP,
  })

  /**
   * HSTS hanya berarti pada koneksi HTTPS. Memasangnya saat dev di http://localhost
   * justru mengunci peramban pengembang ke https untuk seluruh localhost.
   */
  if (isProduction) {
    setResponseHeader(event, 'Strict-Transport-Security', 'max-age=15552000; includeSubDomains')
  }

  // Halaman & endpoint yang memuat data sesi tidak boleh singgah di cache bersama.
  if (event.path.startsWith('/api/')) {
    setResponseHeader(event, 'Cache-Control', 'no-store')
  }
})
