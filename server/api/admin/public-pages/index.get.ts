import { z } from 'zod'
import { defineApiHandler } from '../../../utils/handler'
import { ok } from '../../../utils/response'
import { requireOrganization, requirePermission } from '../../../utils/context'
import { publishService } from '../../../services/publish.service'
import { idSchema } from '../../../../shared/schemas/common'
import { PERMISSIONS } from '../../../../shared/constants/permissions'

export default defineApiHandler(async (event) => {
  const ctx = await requirePermission(event, PERMISSIONS.PUBLIC_PAGE_VIEW)
  const { eventId } = z.object({ eventId: idSchema.optional() }).parse(getQuery(event))
  return ok(await publishService.list(requireOrganization(ctx), eventId))
})
