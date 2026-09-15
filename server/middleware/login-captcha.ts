import { AppError, fail } from '../utils/response'
import { ERROR_CODES } from '../../shared/constants/errors'
import { clientIp } from '../utils/rate-limit'
import { consumeTicket } from '../utils/slider-captcha'

/**
 * Mewajibkan tiket captcha geser pada percobaan masuk.
 *
 * Ditaruh di middleware, bukan di hook Better Auth, karena tiketnya diikat pada
 * alamat IP: middleware memegang H3Event yang sama dengan endpoint captcha, jadi
 * alamat yang dibandingkan dihitung dengan cara yang persis sama. Di dalam hook
 * Better Auth yang tersedia hanya `Request` web, yang pada server tanpa proxy
 * tidak membawa alamat asal sama sekali.
 *
 * Hanya menyentuh permintaan masuk. Endpoint sesi, keluar, dan lainnya lewat
 * tanpa syarat — memblokir `get-session` akan mengunci seluruh aplikasi.
 */
const JALUR_MASUK = '/api/auth/sign-in/email'

export default defineEventHandler((event) => {
  if (event.method !== 'POST') return
  if (event.path.split('?')[0] !== JALUR_MASUK) return

  /**
   * Permintaan tanpa header Origin diserahkan ke penjaga CSRF Better Auth, yang
   * selalu menolaknya dengan 403 MISSING_OR_NULL_ORIGIN — bukan kadang-kadang,
   * melainkan sebelum kredensialnya dilihat sama sekali.
   *
   * Ini bukan celah: permintaan seperti itu tidak pernah bisa berhasil, jadi
   * memeriksanya di sini hanya menukar pesan penolakan yang tepat ("asal
   * permintaan tidak dikenal") dengan yang menyesatkan ("selesaikan verifikasi"),
   * sekaligus menghanguskan tiket captcha yang sah tanpa guna.
   */
  if (!getRequestHeader(event, 'origin')) return

  try {
    consumeTicket(getRequestHeader(event, 'x-captcha-token'), 'login', clientIp(event))
  }
  catch (error) {
    /**
     * Bentuk balasannya disamakan dengan galat API lain sekaligus tetap terbaca
     * oleh klien Better Auth, yang mengambil `message` dari badan respons.
     */
    const code = error instanceof AppError ? error.code : ERROR_CODES.CAPTCHA_REQUIRED
    const message = error instanceof AppError ? error.message : 'Selesaikan verifikasi geser terlebih dahulu'

    setResponseStatus(event, 400)
    return fail(code, message)
  }
})
