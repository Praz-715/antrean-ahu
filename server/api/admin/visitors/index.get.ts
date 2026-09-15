import { z } from 'zod'
import { defineApiHandler } from '../../../utils/handler'
import { ok } from '../../../utils/response'
import { requireOrganization, requirePermission } from '../../../utils/context'
import { visitorService } from '../../../services/visitor.service'
import { idSchema } from '../../../../shared/schemas/common'
import { PERMISSIONS } from '../../../../shared/constants/permissions'

const querySchema = z.object({
  eventId: idSchema,
  search: z.string().trim().max(190).optional(),
  queueTypeId: idSchema.optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
})

export default defineApiHandler(async (event) => {
  const ctx = await requirePermission(event, PERMISSIONS.VISITOR_VIEW)
  const filter = querySchema.parse(getQuery(event))
  return ok(await visitorService.list(requireOrganization(ctx), filter))
})
