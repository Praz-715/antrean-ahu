import { defineApiHandler } from '../../../utils/handler'
import { ok } from '../../../utils/response'
import { requireOrganization, requirePermission } from '../../../utils/context'
import { queueTypeService } from '../../../services/queue-type.service'
import { auditAsync, AUDIT_ACTIONS } from '../../../utils/audit'
import { updateQueueTypeSchema } from '../../../../shared/schemas/queue-type'
import { PERMISSIONS } from '../../../../shared/constants/permissions'

export default defineApiHandler(async (event) => {
  const ctx = await requirePermission(event, PERMISSIONS.QUEUE_TYPE_MANAGE)
  const organizationId = requireOrganization(ctx)
  const id = getRouterParam(event, 'id') as string
  const input = updateQueueTypeSchema.parse(await readBody(event))

  const updated = await queueTypeService.update(organizationId, id, input)
  auditAsync(event, {
    organizationId,
    userId: ctx.userId,
    action: AUDIT_ACTIONS.QUEUE_TYPE_UPDATED,
    entity: 'QueueType',
    entityId: id,
    newData: input,
  })

  return ok(updated, 'Jenis antrean diperbarui')
})
