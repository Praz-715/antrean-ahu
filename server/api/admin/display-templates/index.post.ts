import { z } from 'zod'
import { defineApiHandler } from '../../../utils/handler'
import { ok } from '../../../utils/response'
import { requireOrganization, requirePermission } from '../../../utils/context'
import { displayTemplateService } from '../../../services/display-template.service'
import { idSchema } from '../../../../shared/schemas/common'
import { PERMISSIONS } from '../../../../shared/constants/permissions'

const bodySchema = z.object({
  name: z.string().trim().min(2, 'Nama minimal 2 karakter').max(150),
  type: z.enum(['GLOBAL', 'QUEUE_TYPE']).default('GLOBAL'),
  eventId: idSchema.optional().nullable(),
  background: z.record(z.string(), z.unknown()).optional(),
})

export default defineApiHandler(async (event) => {
  const ctx = await requirePermission(event, PERMISSIONS.DISPLAY_TEMPLATE_MANAGE)
  const input = bodySchema.parse(await readBody(event))
  setResponseStatus(event, 201)
  return ok(await displayTemplateService.create(requireOrganization(ctx), input), 'Template dibuat')
})
