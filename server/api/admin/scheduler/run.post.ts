import { defineApiHandler } from '../../../utils/handler'
import { ok } from '../../../utils/response'
import { requirePermission } from '../../../utils/context'
import { schedulerService } from '../../../services/scheduler.service'
import { PERMISSIONS } from '../../../../shared/constants/permissions'

/**
 * Jalankan satu putaran penjadwal sekarang juga (§10).
 *
 * Penjadwal berjalan tiap menit sendiri; endpoint ini ada supaya admin bisa
 * menyelaraskan status seketika, dan supaya perilakunya bisa diuji tanpa
 * menunggu pergantian menit.
 */
export default defineApiHandler(async (event) => {
  await requirePermission(event, PERMISSIONS.EVENT_CONTROL)
  const result = await schedulerService.runOnce()
  return ok(result, `Penjadwal memeriksa ${result.checked} event`)
})
