import { defineApiHandler } from '../../../utils/handler'
import { ok } from '../../../utils/response'
import { requireOrganization, requirePermission } from '../../../utils/context'
import { settingService } from '../../../services/setting.service'
import { PERMISSIONS } from '../../../../shared/constants/permissions'

/** Nilai seluruh pengaturan sistem. Katalognya sendiri ada di shared/constants/settings.ts. */
export default defineApiHandler(async (event) => {
  const ctx = await requirePermission(event, PERMISSIONS.SETTING_VIEW, PERMISSIONS.SETTING_MANAGE)
  return ok(await settingService.getAll(requireOrganization(ctx)))
})
