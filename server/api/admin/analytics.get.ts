import { z } from 'zod'
import { defineApiHandler } from '../../utils/handler'
import { ok } from '../../utils/response'
import { requireOrganization, requirePermission } from '../../utils/context'
import { analyticsService } from '../../services/analytics.service'
import { dateSchema, idSchema } from '../../../shared/schemas/common'
import { PERMISSIONS } from '../../../shared/constants/permissions'

const querySchema = z.object({
  eventId: idSchema,
  from: dateSchema.optional(),
  to: dateSchema.optional(),
  queueTypeId: idSchema.optional(),
  operatorId: idSchema.optional(),
})

export default defineApiHandler(async (event) => {
  const ctx = await requirePermission(event, PERMISSIONS.ANALYTICS_VIEW, PERMISSIONS.REPORT_VIEW)
  const filter = querySchema.parse(getQuery(event))
  return ok(await analyticsService.overview(requireOrganization(ctx), filter))
})
