import { defineApiHandler } from '../../../utils/handler'
import { ok } from '../../../utils/response'
import { displayService } from '../../../services/display.service'
import { rateLimit } from '../../../utils/rate-limit'

/** Status lengkap satu display. Juga dipakai sebagai fallback polling saat WS putus (§44). */
export default defineApiHandler(async (event) => {
  rateLimit(event, 'display:state', 300)
  const deviceCode = getRouterParam(event, 'deviceCode') as string
  return ok(await displayService.state(deviceCode))
})
