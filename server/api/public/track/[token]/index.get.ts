import { defineApiHandler } from '../../../../utils/handler'
import { ok } from '../../../../utils/response'
import { queueService } from '../../../../services/queue.service'
import { rateLimit } from '../../../../utils/rate-limit'

/** Status antrean pengunjung berdasarkan token publik (tanpa login). */
export default defineApiHandler(async (event) => {
  rateLimit(event, 'public:track', 240)
  const token = getRouterParam(event, 'token') as string
  return ok(await queueService.getByPublicToken(token))
})
