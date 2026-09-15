import { defineApiHandler } from '../../utils/handler'
import { ok } from '../../utils/response'
import { requirePermission } from '../../utils/context'
import { operatorQueueService } from '../../services/operator.service'
import { PERMISSIONS } from '../../../shared/constants/permissions'

/** Daftar penugasan operator: jenis antrean + loket + event. */
export default defineApiHandler(async (event) => {
  const ctx = await requirePermission(event, PERMISSIONS.QUEUE_VIEW)
  return ok(await operatorQueueService.workspace(ctx.userId))
})
