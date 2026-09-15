import { defineApiHandler } from '../../../utils/handler'
import { ok } from '../../../utils/response'
import { requireOrganization, requirePermission } from '../../../utils/context'
import { counterService } from '../../../services/queue-type.service'
import { auditAsync, AUDIT_ACTIONS } from '../../../utils/audit'
import { updateCounterSchema } from '../../../../shared/schemas/queue-type'
import { PERMISSIONS } from '../../../../shared/constants/permissions'

export default defineApiHandler(async (event) => {
  const ctx = await requirePermission(event, PERMISSIONS.COUNTER_MANAGE)
  const organizationId = requireOrganization(ctx)
  const id = getRouterParam(event, 'id') as string
  const input = updateCounterSchema.parse(await readBody(event))

  const updated = await counterService.update(organizationId, id, input)
  auditAsync(event, {
    organizationId,
    userId: ctx.userId,
    action: AUDIT_ACTIONS.COUNTER_UPDATED,
    entity: 'Counter',
    entityId: id,
    newData: input,
  })

  return ok(updated, 'Loket diperbarui')
})
