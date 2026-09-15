import { defineApiHandler } from '../../../utils/handler'
import { ok } from '../../../utils/response'
import { requireOrganization, requirePermission } from '../../../utils/context'
import { datasourceService } from '../../../services/datasource.service'
import { auditAsync, AUDIT_ACTIONS } from '../../../utils/audit'
import { createDataSourceSchema } from '../../../../shared/schemas/data-source'
import { PERMISSIONS } from '../../../../shared/constants/permissions'

export default defineApiHandler(async (event) => {
  const ctx = await requirePermission(event, PERMISSIONS.INTEGRATION_MANAGE)
  const organizationId = requireOrganization(ctx)
  const input = createDataSourceSchema.parse(await readBody(event))

  const source = await datasourceService.create(organizationId, input)

  auditAsync(event, {
    organizationId,
    userId: ctx.userId,
    action: AUDIT_ACTIONS.DATA_SOURCE_CREATED,
    entity: 'DataSource',
    entityId: source.id,
    // Kredensial sengaja tidak ikut dicatat.
    newData: { name: source.name, baseUrl: source.baseUrl, authType: source.authType },
  })

  setResponseStatus(event, 201)
  return ok(source, 'Sumber data dibuat')
})
