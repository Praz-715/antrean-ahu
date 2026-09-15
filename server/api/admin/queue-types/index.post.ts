import { defineApiHandler } from '../../../utils/handler'
import { ok } from '../../../utils/response'
import { requireOrganization, requirePermission } from '../../../utils/context'
import { queueTypeService } from '../../../services/queue-type.service'
import { auditAsync, AUDIT_ACTIONS } from '../../../utils/audit'
import { createQueueTypeSchema } from '../../../../shared/schemas/queue-type'
import { PERMISSIONS } from '../../../../shared/constants/permissions'

export default defineApiHandler(async (event) => {
  const ctx = await requirePermission(event, PERMISSIONS.QUEUE_TYPE_MANAGE)
  const organizationId = requireOrganization(ctx)
  const input = createQueueTypeSchema.parse(await readBody(event))

  const created = await queueTypeService.create(organizationId, input)
  auditAsync(event, {
    organizationId,
    userId: ctx.userId,
    action: AUDIT_ACTIONS.QUEUE_TYPE_CREATED,
    entity: 'QueueType',
    entityId: created.id,
    newData: { code: created.code, name: created.name },
  })

  setResponseStatus(event, 201)
  return ok(created, 'Jenis antrean dibuat')
})
