import { defineApiHandler } from '../../../utils/handler'
import { ok } from '../../../utils/response'
import { displayService } from '../../../services/display.service'
import { clientIp, rateLimit } from '../../../utils/rate-limit'

/** Pairing perangkat display pada pembukaan pertama. */
export default defineApiHandler(async (event) => {
  rateLimit(event, 'display:pair', 10)
  const deviceCode = getRouterParam(event, 'deviceCode') as string
  return ok(await displayService.pair(deviceCode, clientIp(event)), 'Perangkat berhasil dipasangkan')
})
