import { defineApiHandler } from '../../../utils/handler'
import { ok } from '../../../utils/response'
import { requireOrganization, requirePermission } from '../../../utils/context'
import { eventService } from '../../../services/event.service'
import { PERMISSIONS } from '../../../../shared/constants/permissions'

export default defineApiHandler(async (event) => {
  const ctx = await requirePermission(event, PERMISSIONS.EVENT_VIEW)
  const query = getQuery(event)
  const events = await eventService.list(requireOrganization(ctx), {
    search: query.search as string | undefined,
    status: query.status as string | undefined,
  })
  return ok(events)
})
