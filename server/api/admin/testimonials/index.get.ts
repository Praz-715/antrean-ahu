import { z } from 'zod'
import { defineApiHandler } from '../../../utils/handler'
import { ok } from '../../../utils/response'
import { requireOrganization, requirePermission } from '../../../utils/context'
import { testimonialService } from '../../../services/testimonial.service'
import { idSchema } from '../../../../shared/schemas/common'
import { PERMISSIONS } from '../../../../shared/constants/permissions'

const querySchema = z.object({
  eventId: idSchema.optional(),
  rating: z.coerce.number().int().min(1).max(5).optional(),
  status: z.enum(['all', 'approved', 'pending']).default('all'),
  from: z.string().optional(),
  to: z.string().optional(),
  search: z.string().trim().max(190).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
})

export default defineApiHandler(async (event) => {
  const ctx = await requirePermission(event, PERMISSIONS.FEEDBACK_VIEW, PERMISSIONS.FEEDBACK_MODERATE)
  const organizationId = requireOrganization(ctx)
  const filter = querySchema.parse(getQuery(event))

  const [result, summary] = await Promise.all([
    testimonialService.list(organizationId, filter),
    testimonialService.summary(organizationId, filter),
  ])

  return ok({ ...result, summary })
})
