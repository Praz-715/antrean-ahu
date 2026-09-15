import { z } from 'zod'
import { defineApiHandler } from '../../../utils/handler'
import { ok } from '../../../utils/response'
import { requireOrganization, requirePermission } from '../../../utils/context'
import { userService } from '../../../services/user.service'
import { auditAsync, AUDIT_ACTIONS } from '../../../utils/audit'
import { idSchema } from '../../../../shared/schemas/common'
import { PERMISSIONS } from '../../../../shared/constants/permissions'

const bodySchema = z.object({
  name: z.string().trim().min(2, 'Nama minimal 2 karakter').max(150),
  email: z.string().trim().email('Email tidak valid').max(190),
  password: z.string().min(8, 'Kata sandi minimal 8 karakter').max(128),
  username: z.string().trim().max(60).optional().nullable(),
  phone: z.string().trim().max(30).optional().nullable(),
  roleId: idSchema,
})

export default defineApiHandler(async (event) => {
  const ctx = await requirePermission(event, PERMISSIONS.USER_MANAGE)
  const organizationId = requireOrganization(ctx)
  const input = bodySchema.parse(await readBody(event))

  const user = await userService.create(organizationId, input)
  auditAsync(event, {
    organizationId,
    userId: ctx.userId,
    action: AUDIT_ACTIONS.USER_CREATED,
    entity: 'User',
    entityId: user.id,
    newData: { name: user.name, email: user.email },
  })

  setResponseStatus(event, 201)
  return ok(user, 'Pengguna dibuat')
})
