import { z } from 'zod'
import { defineApiHandler } from '../../../utils/handler'
import { ok } from '../../../utils/response'
import { requireOrganization, requirePermission } from '../../../utils/context'
import { formService } from '../../../services/form.service'
import { auditAsync, AUDIT_ACTIONS } from '../../../utils/audit'
import { idSchema } from '../../../../shared/schemas/common'
import { PERMISSIONS } from '../../../../shared/constants/permissions'

const bodySchema = z.object({
  name: z.string().trim().min(2, 'Nama minimal 2 karakter').max(150).optional(),
  description: z.string().trim().max(500).optional().nullable(),
  dataSourceId: idSchema.nullable().optional(),
  requireCaptcha: z.boolean().optional(),
})

export default defineApiHandler(async (event) => {
  const ctx = await requirePermission(event, PERMISSIONS.FORM_MANAGE)
  const organizationId = requireOrganization(ctx)
  const id = getRouterParam(event, 'id') as string
  const input = bodySchema.parse(await readBody(event))

  const form = await formService.update(organizationId, id, input)

  auditAsync(event, {
    organizationId,
    userId: ctx.userId,
    action: AUDIT_ACTIONS.FORM_UPDATED,
    entity: 'FormDefinition',
    entityId: id,
    newData: { name: form.name, dataSourceId: form.dataSourceId, requireCaptcha: form.requireCaptcha },
  })

  return ok(form, 'Formulir diperbarui')
})
