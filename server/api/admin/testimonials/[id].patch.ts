import { z } from 'zod'
import { defineApiHandler } from '../../../utils/handler'
import { ok } from '../../../utils/response'
import { requireOrganization, requirePermission } from '../../../utils/context'
import { testimonialService } from '../../../services/testimonial.service'
import { auditAsync, AUDIT_ACTIONS } from '../../../utils/audit'
import { PERMISSIONS } from '../../../../shared/constants/permissions'

const bodySchema = z.object({ isApproved: z.boolean() })

/** Setujui atau sembunyikan testimoni (§23). */
export default defineApiHandler(async (event) => {
  const ctx = await requirePermission(event, PERMISSIONS.FEEDBACK_MODERATE)
  const organizationId = requireOrganization(ctx)
  const id = getRouterParam(event, 'id') as string
  const { isApproved } = bodySchema.parse(await readBody(event))

  const testimonial = await testimonialService.moderate(organizationId, id, isApproved, ctx.userId)

  auditAsync(event, {
    organizationId,
    userId: ctx.userId,
    action: AUDIT_ACTIONS.TESTIMONIAL_MODERATED,
    entity: 'Testimonial',
    entityId: id,
    newData: { isApproved },
  })

  return ok(testimonial, isApproved ? 'Testimoni disetujui' : 'Testimoni disembunyikan')
})
