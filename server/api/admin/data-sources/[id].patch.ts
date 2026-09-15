import { defineApiHandler } from '../../../utils/handler'
import { ok } from '../../../utils/response'
import { requireOrganization, requirePermission } from '../../../utils/context'
import { datasourceService } from '../../../services/datasource.service'
import { auditAsync, AUDIT_ACTIONS } from '../../../utils/audit'
import { updateDataSourceSchema } from '../../../../shared/schemas/data-source'
import { PERMISSIONS } from '../../../../shared/constants/permissions'

export default defineApiHandler(async (event) => {
  const ctx = await requirePermission(event, PERMISSIONS.INTEGRATION_MANAGE)
  const organizationId = requireOrganization(ctx)
  const id = getRouterParam(event, 'id') as string
  const input = updateDataSourceSchema.parse(await readBody(event))

  const source = await datasourceService.update(organizationId, id, input)

  auditAsync(event, {
    organizationId,
    userId: ctx.userId,
    action: AUDIT_ACTIONS.DATA_SOURCE_UPDATED,
    entity: 'DataSource',
    entityId: id,
    newData: {
      name: source.name,
      baseUrl: source.baseUrl,
      authType: source.authType,
      isActive: source.isActive,
      credentialsChanged: input.credentials !== undefined,
    },
  })

  return ok(source, 'Sumber data diperbarui')
})
