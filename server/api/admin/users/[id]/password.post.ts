import { z } from 'zod'
import { defineApiHandler } from '../../../../utils/handler'
import { ok } from '../../../../utils/response'
import { requireOrganization, requirePermission } from '../../../../utils/context'
import { userService } from '../../../../services/user.service'
import { auditAsync, AUDIT_ACTIONS } from '../../../../utils/audit'
import { PERMISSIONS } from '../../../../../shared/constants/permissions'

const bodySchema = z.object({ password: z.string().min(8, 'Kata sandi minimal 8 karakter').max(128) })

export default defineApiHandler(async (event) => {
  const ctx = await requirePermission(event, PERMISSIONS.USER_MANAGE)
  const organizationId = requireOrganization(ctx)
  const id = getRouterParam(event, 'id') as string
  const { password } = bodySchema.parse(await readBody(event))

  const user = await userService.resetPassword(organizationId, id, password)
  auditAsync(event, {
    organizationId,
    userId: ctx.userId,
    action: AUDIT_ACTIONS.USER_UPDATED,
    entity: 'User',
    entityId: id,
    newData: { passwordReset: true },
  })

  return ok({ id: user.id }, 'Kata sandi direset. Sesi aktif pengguna telah dicabut.')
})
