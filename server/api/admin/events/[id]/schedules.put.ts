import { defineApiHandler } from '../../../../utils/handler'
import { ok } from '../../../../utils/response'
import { requireOrganization, requirePermission } from '../../../../utils/context'
import { eventService } from '../../../../services/event.service'
import { auditAsync, AUDIT_ACTIONS } from '../../../../utils/audit'
import { updateSchedulesSchema } from '../../../../../shared/schemas/event'
import { PERMISSIONS } from '../../../../../shared/constants/permissions'

export default defineApiHandler(async (event) => {
  const ctx = await requirePermission(event, PERMISSIONS.EVENT_MANAGE)
  const organizationId = requireOrganization(ctx)
  const id = getRouterParam(event, 'id') as string
  const { schedules } = updateSchedulesSchema.parse(await readBody(event))

  const saved = await eventService.replaceWeeklySchedules(organizationId, id, schedules)
  auditAsync(event, {
    organizationId,
    userId: ctx.userId,
    action: AUDIT_ACTIONS.EVENT_UPDATED,
    entity: 'EventSchedule',
    entityId: id,
    newData: { schedules },
  })

  return ok(saved, 'Jam layanan diperbarui')
})
