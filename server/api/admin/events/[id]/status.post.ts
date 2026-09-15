import { defineApiHandler } from '../../../../utils/handler'
import { ok } from '../../../../utils/response'
import { requireOrganization, requirePermission } from '../../../../utils/context'
import { eventService } from '../../../../services/event.service'
import { auditAsync, AUDIT_ACTIONS } from '../../../../utils/audit'
import { emitEventStatus } from '../../../../realtime/emitters'
import { eventStatusSchema } from '../../../../../shared/schemas/event'
import { PERMISSIONS } from '../../../../../shared/constants/permissions'

export default defineApiHandler(async (event) => {
  const ctx = await requirePermission(event, PERMISSIONS.EVENT_CONTROL)
  const organizationId = requireOrganization(ctx)
  const id = getRouterParam(event, 'id') as string
  const { status } = eventStatusSchema.parse(await readBody(event))

  const updated = await eventService.setStatus(organizationId, id, status)

  const action = status === 'OPEN'
    ? AUDIT_ACTIONS.EVENT_OPENED
    : status === 'PAUSED'
      ? AUDIT_ACTIONS.EVENT_PAUSED
      : status === 'CLOSED'
        ? AUDIT_ACTIONS.EVENT_CLOSED
        : AUDIT_ACTIONS.EVENT_UPDATED

  auditAsync(event, {
    organizationId,
    userId: ctx.userId,
    action,
    entity: 'Event',
    entityId: id,
    newData: { status },
  })

  emitEventStatus(updated.id, organizationId, status)

  return ok(updated, 'Status event diperbarui menjadi ' + status)
})
