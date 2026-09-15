import { defineApiHandler } from '../../../utils/handler'
import { ok } from '../../../utils/response'
import { requireOrganization, requirePermission } from '../../../utils/context'
import { eventService } from '../../../services/event.service'
import { PERMISSIONS } from '../../../../shared/constants/permissions'

export default defineApiHandler(async (event) => {
  const ctx = await requirePermission(event, PERMISSIONS.EVENT_VIEW)
  const id = getRouterParam(event, 'id') as string
  const data = await eventService.getById(requireOrganization(ctx), id)
  const openState = await eventService.getOpenState(id)
  return ok({ ...data, openState })
})
