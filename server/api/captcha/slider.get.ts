import { z } from 'zod'
import { defineApiHandler } from '../../utils/handler'
import { ok } from '../../utils/response'
import { clientIp, rateLimit } from '../../utils/rate-limit'
import { issueChallenge } from '../../utils/slider-captcha'

const querySchema = z.object({
  purpose: z.enum(['login', 'queue']).default('login'),
})

/**
 * Meminta satu teka-teki captcha geser.
 *
 * Terbuka tanpa autentikasi — halaman masuk memakainya justru sebelum ada sesi.
 * Batasnya cukup longgar untuk orang yang beberapa kali minta teka-teki baru,
 * tetapi menutup pembuatan teka-teki secara borongan.
 */
export default defineApiHandler(async (event) => {
  rateLimit(event, 'captcha:challenge', 40, 60_000)

  const { purpose } = querySchema.parse(getQuery(event))
  const challenge = issueChallenge(purpose, clientIp(event))

  // Teka-teki tidak boleh nyangkut di cache mana pun: tiap permintaan harus baru.
  setResponseHeader(event, 'Cache-Control', 'no-store')

  return ok(challenge)
})
