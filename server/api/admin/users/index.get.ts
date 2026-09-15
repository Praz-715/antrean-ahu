import { defineApiHandler } from '../../../utils/handler'
import { ok } from '../../../utils/response'
import { requireOrganization, requirePermission } from '../../../utils/context'
import { userService } from '../../../services/user.service'
import { PERMISSIONS } from '../../../../shared/constants/permissions'

export default defineApiHandler(async (event) => {
  const ctx = await requirePermission(event, PERMISSIONS.USER_VIEW)
  const organizationId = requireOrganization(ctx)
  const query = getQuery(event)

  const [users, roles] = await Promise.all([
    userService.list(organizationId, { search: query.search as string | undefined }),
    userService.roles(organizationId),
  ])

  return ok({ users, roles })
})
