import { defineApiHandler } from '../../../utils/handler'
import { ok } from '../../../utils/response'
import { requireOrganization, requirePermission } from '../../../utils/context'
import { publishService } from '../../../services/publish.service'
import { PERMISSIONS } from '../../../../shared/constants/permissions'

export default defineApiHandler(async (event) => {
  const ctx = await requirePermission(event, PERMISSIONS.PUBLIC_PAGE_MANAGE)
  const id = getRouterParam(event, 'id') as string
  await publishService.softDelete(requireOrganization(ctx), id)
  return ok({ id }, 'Halaman publik dihapus')
})
