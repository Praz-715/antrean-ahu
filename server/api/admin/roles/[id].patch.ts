import { z } from 'zod'
import { defineApiHandler } from '../../../utils/handler'
import { ok } from '../../../utils/response'
import { requireOrganization, requirePermission } from '../../../utils/context'
import { roleService } from '../../../services/role.service'
import { auditAsync, AUDIT_ACTIONS } from '../../../utils/audit'
import { PERMISSIONS } from '../../../../shared/constants/permissions'

const bodySchema = z.object({
  name: z.string().trim().min(3).max(120).optional(),
  description: z.string().trim().max(255).optional().nullable(),
  permissions: z.array(z.string().max(80)).max(100).optional(),
})

export default defineApiHandler(async (event) => {
  const ctx = await requirePermission(event, PERMISSIONS.ROLE_MANAGE)
  const organizationId = requireOrganization(ctx)
  const id = getRouterParam(event, 'id') as string
  const input = bodySchema.parse(await readBody(event))

  const role = await roleService.update(organizationId, id, input)

  auditAsync(event, {
    organizationId,
    userId: ctx.userId,
    action: AUDIT_ACTIONS.ROLE_UPDATED,
    entity: 'Role',
    entityId: id,
    newData: { name: role.name, permissions: role.permissions },
  })

  return ok(role, 'Role diperbarui')
})
