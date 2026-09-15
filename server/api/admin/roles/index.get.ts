import { defineApiHandler } from '../../../utils/handler'
import { ok } from '../../../utils/response'
import { requireOrganization, requirePermission } from '../../../utils/context'
import { roleService } from '../../../services/role.service'
import { PERMISSIONS } from '../../../../shared/constants/permissions'

export default defineApiHandler(async (event) => {
  const ctx = await requirePermission(event, PERMISSIONS.ROLE_MANAGE, PERMISSIONS.USER_VIEW)
  return ok(await roleService.list(requireOrganization(ctx)))
})
