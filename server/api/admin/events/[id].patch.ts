import { defineApiHandler } from '../../../utils/handler'
import { ok } from '../../../utils/response'
import { requireOrganization, requirePermission } from '../../../utils/context'
import { eventService } from '../../../services/event.service'
import { auditAsync, AUDIT_ACTIONS } from '../../../utils/audit'
import { updateEventSchema } from '../../../../shared/schemas/event'
import { PERMISSIONS } from '../../../../shared/constants/permissions'

export default defineApiHandler(async (event) => {
  const ctx = await requirePermission(event, PERMISSIONS.EVENT_MANAGE)
  const organizationId = requireOrganization(ctx)
  const id = getRouterParam(event, 'id') as string
  const input = updateEventSchema.parse(await readBody(event))

  const before = await eventService.getById(organizationId, id)
  const updated = await eventService.update(organizationId, id, input)

  auditAsync(event, {
    organizationId,
    userId: ctx.userId,
    action: AUDIT_ACTIONS.EVENT_UPDATED,
    entity: 'Event',
    entityId: id,
    oldData: { name: before.name, timezone: before.timezone },
    newData: { name: updated.name, timezone: updated.timezone },
  })

  return ok(updated, 'Event diperbarui')
})
