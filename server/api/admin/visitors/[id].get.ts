import { defineApiHandler } from '../../../utils/handler'
import { ok } from '../../../utils/response'
import { requireOrganization, requirePermission } from '../../../utils/context'
import { visitorService } from '../../../services/visitor.service'
import { PERMISSIONS } from '../../../../shared/constants/permissions'

export default defineApiHandler(async (event) => {
  const ctx = await requirePermission(event, PERMISSIONS.VISITOR_VIEW)
  const id = getRouterParam(event, 'id') as string
  return ok(await visitorService.getById(requireOrganization(ctx), id))
})
