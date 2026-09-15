import { defineApiHandler } from '../../../utils/handler'
import { ok } from '../../../utils/response'
import { requireOrganization, requirePermission } from '../../../utils/context'
import { datasourceService } from '../../../services/datasource.service'
import { PERMISSIONS } from '../../../../shared/constants/permissions'

export default defineApiHandler(async (event) => {
  const ctx = await requirePermission(event, PERMISSIONS.INTEGRATION_VIEW, PERMISSIONS.INTEGRATION_MANAGE)
  return ok(await datasourceService.list(requireOrganization(ctx)))
})
