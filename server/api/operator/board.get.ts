import { z } from 'zod'
import { defineApiHandler } from '../../utils/handler'
import { ok } from '../../utils/response'
import { requirePermission } from '../../utils/context'
import { operatorQueueService } from '../../services/operator.service'
import { idSchema } from '../../../shared/schemas/common'
import { PERMISSIONS } from '../../../shared/constants/permissions'

/** Papan kerja operator untuk satu jenis antrean. */
export default defineApiHandler(async (event) => {
  const ctx = await requirePermission(event, PERMISSIONS.QUEUE_VIEW)
  const { queueTypeId } = z.object({ queueTypeId: idSchema }).parse(getQuery(event))
  return ok(await operatorQueueService.board(ctx.userId, queueTypeId))
})
