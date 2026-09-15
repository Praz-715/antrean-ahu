import { z } from 'zod'
import { defineApiHandler } from '../../../utils/handler'
import { ok } from '../../../utils/response'
import { requireOrganization, requirePermission } from '../../../utils/context'
import { displayTemplateService } from '../../../services/display-template.service'
import { idSchema } from '../../../../shared/schemas/common'
import { PERMISSIONS } from '../../../../shared/constants/permissions'

export default defineApiHandler(async (event) => {
  const ctx = await requirePermission(event, PERMISSIONS.DISPLAY_VIEW)
  const { eventId } = z.object({ eventId: idSchema.optional() }).parse(getQuery(event))
  return ok(await displayTemplateService.list(requireOrganization(ctx), eventId))
})
