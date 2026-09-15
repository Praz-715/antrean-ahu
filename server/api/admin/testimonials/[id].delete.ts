import { defineApiHandler } from '../../../utils/handler'
import { ok } from '../../../utils/response'
import { requireOrganization, requirePermission } from '../../../utils/context'
import { testimonialService } from '../../../services/testimonial.service'
import { auditAsync, AUDIT_ACTIONS } from '../../../utils/audit'
import { PERMISSIONS } from '../../../../shared/constants/permissions'

export default defineApiHandler(async (event) => {
  const ctx = await requirePermission(event, PERMISSIONS.FEEDBACK_MODERATE)
  const organizationId = requireOrganization(ctx)
  const id = getRouterParam(event, 'id') as string

  const testimonial = await testimonialService.remove(organizationId, id)

  auditAsync(event, {
    organizationId,
    userId: ctx.userId,
    action: AUDIT_ACTIONS.TESTIMONIAL_DELETED,
    entity: 'Testimonial',
    entityId: id,
    oldData: { rating: testimonial.rating, comment: testimonial.comment },
  })

  return ok({ id }, 'Testimoni dihapus')
})
