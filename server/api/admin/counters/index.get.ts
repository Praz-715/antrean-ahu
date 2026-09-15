import { z } from 'zod'
import { defineApiHandler } from '../../../utils/handler'
import { ok } from '../../../utils/response'
import { requireOrganization, requirePermission } from '../../../utils/context'
import { counterService } from '../../../services/queue-type.service'
import { idSchema } from '../../../../shared/schemas/common'
import { PERMISSIONS } from '../../../../shared/constants/permissions'

export default defineApiHandler(async (event) => {
  const ctx = await requirePermission(event, PERMISSIONS.QUEUE_TYPE_VIEW, PERMISSIONS.COUNTER_MANAGE)
  const { eventId } = z.object({ eventId: idSchema }).parse(getQuery(event))
  return ok(await counterService.list(requireOrganization(ctx), eventId))
})
