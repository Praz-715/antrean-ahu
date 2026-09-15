import { z } from 'zod'
import { defineApiHandler } from '../../../utils/handler'
import { ok } from '../../../utils/response'
import { requireOrganization, requirePermission } from '../../../utils/context'
import { displayTemplateService } from '../../../services/display-template.service'
import { idSchema } from '../../../../shared/schemas/common'
import { PERMISSIONS } from '../../../../shared/constants/permissions'

const bodySchema = z.object({
  name: z.string().trim().min(2).max(150).optional(),
  eventId: idSchema.optional().nullable(),
  background: z.record(z.string(), z.unknown()).optional().nullable(),
  settings: z.record(z.string(), z.unknown()).optional().nullable(),
  isDefault: z.boolean().optional(),
})

export default defineApiHandler(async (event) => {
  const ctx = await requirePermission(event, PERMISSIONS.DISPLAY_TEMPLATE_MANAGE)
  const id = getRouterParam(event, 'id') as string
  const input = bodySchema.parse(await readBody(event))
  return ok(await displayTemplateService.update(requireOrganization(ctx), id, input), 'Template diperbarui')
})
