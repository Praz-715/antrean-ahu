import { defineApiHandler } from '../../../utils/handler'
import { ok } from '../../../utils/response'
import { requireOrganization, requirePermission } from '../../../utils/context'
import { counterService } from '../../../services/queue-type.service'
import { auditAsync, AUDIT_ACTIONS } from '../../../utils/audit'
import { PERMISSIONS } from '../../../../shared/constants/permissions'

export default defineApiHandler(async (event) => {
  const ctx = await requirePermission(event, PERMISSIONS.COUNTER_MANAGE)
  const organizationId = requireOrganization(ctx)
  const id = getRouterParam(event, 'id') as string

  const removed = await counterService.remove(organizationId, id)
  auditAsync(event, {
    organizationId,
    userId: ctx.userId,
    action: AUDIT_ACTIONS.COUNTER_DELETED,
    entity: 'Counter',
    entityId: id,
    oldData: { code: removed.code, name: removed.name },
  })

  return ok({ id }, 'Loket dihapus')
})
