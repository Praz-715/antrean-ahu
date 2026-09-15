import { defineApiHandler } from '../../../utils/handler'
import { ok } from '../../../utils/response'
import { requireOrganization, requirePermission } from '../../../utils/context'
import { publishService } from '../../../services/publish.service'
import { PERMISSIONS } from '../../../../shared/constants/permissions'

/**
 * Satu halaman publik beserta QR-nya.
 *
 * Dipakai builder, yang dibuka lewat tautan langsung `/admin/public-pages/{id}` —
 * tanpa endpoint ini builder harus menarik seluruh daftar halaman hanya untuk
 * menemukan satu baris.
 */
export default defineApiHandler(async (event) => {
  const ctx = await requirePermission(event, PERMISSIONS.PUBLIC_PAGE_VIEW)
  const id = getRouterParam(event, 'id') as string
  return ok(await publishService.getById(requireOrganization(ctx), id))
})
