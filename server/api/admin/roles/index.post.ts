import { z } from 'zod'
import { defineApiHandler } from '../../../utils/handler'
import { ok } from '../../../utils/response'
import { requireOrganization, requirePermission } from '../../../utils/context'
import { roleService } from '../../../services/role.service'
import { auditAsync, AUDIT_ACTIONS } from '../../../utils/audit'
import { PERMISSIONS } from '../../../../shared/constants/permissions'

const bodySchema = z.object({
  name: z.string().trim().min(3, 'Nama role minimal 3 karakter').max(120),
  description: z.string().trim().max(255).optional().nullable(),
  permissions: z.array(z.string().max(80)).max(100).default([]),
})

export default defineApiHandler(async (event) => {
  const ctx = await requirePermission(event, PERMISSIONS.ROLE_MANAGE)
  const organizationId = requireOrganization(ctx)
  const input = bodySchema.parse(await readBody(event))

  const role = await roleService.create(organizationId, input)

  auditAsync(event, {
    organizationId,
    userId: ctx.userId,
    action: AUDIT_ACTIONS.ROLE_CREATED,
    entity: 'Role',
    entityId: role.id,
    newData: { key: role.key, name: role.name, permissionCount: role.permissions.length },
  })

  setResponseStatus(event, 201)
  return ok(role, 'Role dibuat')
})
