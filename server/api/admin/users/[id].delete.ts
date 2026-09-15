import { defineApiHandler } from '../../../utils/handler'
import { ok } from '../../../utils/response'
import { requireOrganization, requirePermission } from '../../../utils/context'
import { userService } from '../../../services/user.service'
import { auditAsync, AUDIT_ACTIONS } from '../../../utils/audit'
import { PERMISSIONS } from '../../../../shared/constants/permissions'

export default defineApiHandler(async (event) => {
  const ctx = await requirePermission(event, PERMISSIONS.USER_MANAGE)
  const organizationId = requireOrganization(ctx)
  const id = getRouterParam(event, 'id') as string

  const removed = await userService.softDelete(organizationId, id, ctx.userId)
  auditAsync(event, {
    organizationId,
    userId: ctx.userId,
    action: AUDIT_ACTIONS.USER_DELETED,
    entity: 'User',
    entityId: id,
    oldData: { name: removed.name, email: removed.email },
  })

  return ok({ id }, 'Pengguna dihapus')
})
