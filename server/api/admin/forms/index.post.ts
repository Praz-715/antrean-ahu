import { z } from 'zod'
import { defineApiHandler } from '../../../utils/handler'
import { ok } from '../../../utils/response'
import { requireOrganization, requirePermission } from '../../../utils/context'
import { formService } from '../../../services/form.service'
import { idSchema } from '../../../../shared/schemas/common'
import { PERMISSIONS } from '../../../../shared/constants/permissions'

const bodySchema = z.object({
  eventId: idSchema,
  name: z.string().trim().min(2, 'Nama minimal 2 karakter').max(150),
  description: z.string().trim().max(500).optional().nullable(),
})

export default defineApiHandler(async (event) => {
  const ctx = await requirePermission(event, PERMISSIONS.FORM_MANAGE)
  const input = bodySchema.parse(await readBody(event))
  setResponseStatus(event, 201)
  return ok(await formService.create(requireOrganization(ctx), input), 'Formulir dibuat')
})
