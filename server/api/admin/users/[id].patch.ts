import { z } from 'zod'
import { defineApiHandler } from '../../../utils/handler'
import { ok } from '../../../utils/response'
import { requireOrganization, requirePermission } from '../../../utils/context'
import { userService } from '../../../services/user.service'
import { auditAsync, AUDIT_ACTIONS } from '../../../utils/audit'
import { idSchema } from '../../../../shared/schemas/common'
import { PERMISSIONS } from '../../../../shared/constants/permissions'

const bodySchema = z.object({
  name: z.string().trim().min(2).max(150).optional(),
  username: z.string().trim().max(60).optional().nullable(),
  phone: z.string().trim().max(30).optional().nullable(),
  isActive: z.boolean().optional(),
  roleId: idSchema.optional(),
})

export default defineApiHandler(async (event) => {
  const ctx = await requirePermission(event, PERMISSIONS.USER_MANAGE)
  const organizationId = requireOrganization(ctx)
  const id = getRouterParam(event, 'id') as string
  const input = bodySchema.parse(await readBody(event))

  const user = await userService.update(organizationId, id, input)
  auditAsync(event, {
    organizationId,
    userId: ctx.userId,
    action: AUDIT_ACTIONS.USER_UPDATED,
    entity: 'User',
    entityId: id,
    newData: input,
  })

  return ok(user, 'Pengguna diperbarui')
})
