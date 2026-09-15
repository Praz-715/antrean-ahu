import { defineApiHandler } from '../../../utils/handler'
import { ok } from '../../../utils/response'
import { requireOrganization, requirePermission } from '../../../utils/context'
import { organizationService } from '../../../services/organization.service'
import { PERMISSIONS } from '../../../../shared/constants/permissions'

/** Identitas organisasi — nama yang tampil di seluruh antarmuka (§26). */
export default defineApiHandler(async (event) => {
  const ctx = await requirePermission(event, PERMISSIONS.SETTING_VIEW, PERMISSIONS.SETTING_MANAGE)
  return ok(await organizationService.get(requireOrganization(ctx)))
})
