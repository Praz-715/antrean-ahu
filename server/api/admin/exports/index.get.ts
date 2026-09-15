import { defineApiHandler } from '../../../utils/handler'
import { ok } from '../../../utils/response'
import { requireOrganization, requirePermission } from '../../../utils/context'
import { exportService } from '../../../services/export.service'
import { PERMISSIONS } from '../../../../shared/constants/permissions'

export default defineApiHandler(async (event) => {
  const ctx = await requirePermission(event, PERMISSIONS.REPORT_EXPORT, PERMISSIONS.REPORT_VIEW)
  return ok(await exportService.list(requireOrganization(ctx), ctx.userId))
})
