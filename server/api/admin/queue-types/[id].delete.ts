import { defineApiHandler } from '../../../utils/handler'
import { ok } from '../../../utils/response'
import { requireOrganization, requirePermission } from '../../../utils/context'
import { queueTypeService } from '../../../services/queue-type.service'
import { auditAsync, AUDIT_ACTIONS } from '../../../utils/audit'
import { PERMISSIONS } from '../../../../shared/constants/permissions'

export default defineApiHandler(async (event) => {
  const ctx = await requirePermission(event, PERMISSIONS.QUEUE_TYPE_MANAGE)
  const organizationId = requireOrganization(ctx)
  const id = getRouterParam(event, 'id') as string

  const removed = await queueTypeService.softDelete(organizationId, id)
  auditAsync(event, {
    organizationId,
    userId: ctx.userId,
    action: AUDIT_ACTIONS.QUEUE_TYPE_DELETED,
    entity: 'QueueType',
    entityId: id,
    oldData: { code: removed.code, name: removed.name },
  })

  return ok({ id }, 'Jenis antrean dihapus')
})
