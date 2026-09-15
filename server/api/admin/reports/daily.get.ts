import { z } from 'zod'
import { defineApiHandler } from '../../../utils/handler'
import { ok } from '../../../utils/response'
import { requireOrganization, requirePermission } from '../../../utils/context'
import { reportService } from '../../../services/report.service'
import { dateSchema, idSchema } from '../../../../shared/schemas/common'
import { PERMISSIONS } from '../../../../shared/constants/permissions'

const querySchema = z.object({ eventId: idSchema, date: dateSchema.optional() })

export default defineApiHandler(async (event) => {
  const ctx = await requirePermission(event, PERMISSIONS.REPORT_VIEW)
  const { eventId, date } = querySchema.parse(getQuery(event))
  return ok(await reportService.daily(requireOrganization(ctx), eventId, date))
})
