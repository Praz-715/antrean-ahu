import { z } from 'zod'
import { defineApiHandler } from '../../utils/handler'
import { ok } from '../../utils/response'
import { requireOrganization, requirePermission } from '../../utils/context'
import { statsService } from '../../services/stats.service'
import { dateSchema, idSchema } from '../../../shared/schemas/common'
import { PERMISSIONS } from '../../../shared/constants/permissions'

const querySchema = z.object({ eventId: idSchema, date: dateSchema.optional() })

export default defineApiHandler(async (event) => {
  const ctx = await requirePermission(event, PERMISSIONS.DASHBOARD_VIEW, PERMISSIONS.QUEUE_VIEW)
  const { eventId, date } = querySchema.parse(getQuery(event))
  return ok(await statsService.dashboard(requireOrganization(ctx), eventId, date))
})
