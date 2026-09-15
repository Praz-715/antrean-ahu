import { defineApiHandler } from '../../../utils/handler'
import { ok } from '../../../utils/response'
import { requireOrganization, requirePermission } from '../../../utils/context'
import { assignmentService } from '../../../services/user.service'
import { auditAsync, AUDIT_ACTIONS } from '../../../utils/audit'
import { PERMISSIONS } from '../../../../shared/constants/permissions'

export default defineApiHandler(async (event) => {
  const ctx = await requirePermission(event, PERMISSIONS.ASSIGNMENT_MANAGE)
  const organizationId = requireOrganization(ctx)
  const id = getRouterParam(event, 'id') as string

  await assignmentService.remove(organizationId, id)
  auditAsync(event, {
    organizationId,
    userId: ctx.userId,
    action: AUDIT_ACTIONS.ASSIGNMENT_UPDATED,
    entity: 'OperatorAssignment',
    entityId: id,
    oldData: { removed: true },
  })

  return ok({ id }, 'Penugasan dihapus')
})
