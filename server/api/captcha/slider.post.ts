import { z } from 'zod'
import { defineApiHandler } from '../../utils/handler'
import { ok } from '../../utils/response'
import { clientIp, rateLimit } from '../../utils/rate-limit'
import { CAPTCHA_CANVAS, solveChallenge } from '../../utils/slider-captcha'

const bodySchema = z.object({
  id: z.string().min(1).max(64),
  /** Posisi kiri potongan saat dilepas, dalam piksel kanvas. */
  x: z.number().min(0).max(CAPTCHA_CANVAS.width),
  durationMs: z.number().min(0).max(600_000),
  moves: z.number().int().min(0).max(100_000),
  purpose: z.enum(['login', 'queue']),
})

/**
 * Mengirim jawaban geseran. Bila pas, kembali satu tiket sekali pakai yang
 * dilampirkan pada permintaan berikutnya (masuk / ambil nomor antrean).
 *
 * Dibatasi lebih ketat daripada permintaan teka-teki: menebak posisi butuh banyak
 * percobaan, dan di sinilah tebakan itu akan terlihat.
 */
export default defineApiHandler(async (event) => {
  rateLimit(event, 'captcha:solve', 30, 60_000)

  const body = bodySchema.parse(await readBody(event))
  const token = solveChallenge({ ...body, ip: clientIp(event) })

  setResponseHeader(event, 'Cache-Control', 'no-store')

  return ok({ token }, 'Verifikasi berhasil')
})
