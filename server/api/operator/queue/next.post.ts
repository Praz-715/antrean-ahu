import { z } from 'zod'
import { defineApiHandler } from '../../../utils/handler'
import { ok } from '../../../utils/response'
import { requirePermission } from '../../../utils/context'
import { operatorQueueService } from '../../../services/operator.service'
import { broadcastQueue } from '../../../realtime/queue-broadcast'
import { auditAsync, AUDIT_ACTIONS } from '../../../utils/audit'
import { SOCKET_EVENTS } from '../../../../shared/constants/socket'
import { idSchema } from '../../../../shared/schemas/common'
import { PERMISSIONS } from '../../../../shared/constants/permissions'

const bodySchema = z.object({
  queueTypeId: idSchema,
  counterId: idSchema.optional().nullable(),
})

/** Panggil antrean berikutnya (§14). Aman terhadap dua operator yang menekan bersamaan. */
export default defineApiHandler(async (event) => {
  const ctx = await requirePermission(event, PERMISSIONS.QUEUE_CALL)
  const body = bodySchema.parse(await readBody(event))

  const queue = await operatorQueueService.callNext({
    userId: ctx.userId,
    queueTypeId: body.queueTypeId,
    counterId: body.counterId ?? null,
  })

  broadcastQueue(SOCKET_EVENTS.QUEUE_CALLED, queue)

  auditAsync(event, {
    organizationId: queue.organizationId,
    userId: ctx.userId,
    action: AUDIT_ACTIONS.QUEUE_CALLED,
    entity: 'Queue',
    entityId: queue.id,
    newData: { queueNumber: queue.queueNumber, counter: queue.counter?.name },
  })

  return ok(queue, 'Antrean ' + queue.queueNumber + ' dipanggil')
})
