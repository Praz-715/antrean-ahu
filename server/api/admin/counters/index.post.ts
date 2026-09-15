import { defineApiHandler } from '../../../utils/handler'
import { ok } from '../../../utils/response'
import { requireOrganization, requirePermission } from '../../../utils/context'
import { counterService } from '../../../services/queue-type.service'
import { auditAsync, AUDIT_ACTIONS } from '../../../utils/audit'
import { createCounterSchema } from '../../../../shared/schemas/queue-type'
import { PERMISSIONS } from '../../../../shared/constants/permissions'

export default defineApiHandler(async (event) => {
  const ctx = await requirePermission(event, PERMISSIONS.COUNTER_MANAGE)
  const organizationId = requireOrganization(ctx)
  const input = createCounterSchema.parse(await readBody(event))

  const created = await counterService.create(organizationId, input)
  auditAsync(event, {
    organizationId,
    userId: ctx.userId,
    action: AUDIT_ACTIONS.COUNTER_CREATED,
    entity: 'Counter',
    entityId: created.id,
    newData: { code: created.code, name: created.name },
  })

  setResponseStatus(event, 201)
  return ok(created, 'Loket dibuat')
})
