import { defineApiHandler } from '../../../utils/handler'
import { ok } from '../../../utils/response'
import { requireOrganization, requirePermission } from '../../../utils/context'
import { eventService } from '../../../services/event.service'
import { auditAsync, AUDIT_ACTIONS } from '../../../utils/audit'
import { createEventSchema } from '../../../../shared/schemas/event'
import { PERMISSIONS } from '../../../../shared/constants/permissions'

export default defineApiHandler(async (event) => {
  const ctx = await requirePermission(event, PERMISSIONS.EVENT_MANAGE)
  const organizationId = requireOrganization(ctx)
  const input = createEventSchema.parse(await readBody(event))

  const created = await eventService.create(organizationId, input)
  auditAsync(event, {
    organizationId,
    userId: ctx.userId,
    action: AUDIT_ACTIONS.EVENT_CREATED,
    entity: 'Event',
    entityId: created.id,
    newData: { name: created.name, slug: created.slug },
  })

  setResponseStatus(event, 201)
  return ok(created, 'Event berhasil dibuat')
})
