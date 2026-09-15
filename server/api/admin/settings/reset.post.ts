import { defineApiHandler } from '../../../utils/handler'
import { ok } from '../../../utils/response'
import { requireOrganization, requirePermission } from '../../../utils/context'
import { settingService } from '../../../services/setting.service'
import { auditAsync, AUDIT_ACTIONS } from '../../../utils/audit'
import { PERMISSIONS } from '../../../../shared/constants/permissions'

/** Kembalikan seluruh pengaturan ke nilai bawaan katalog. */
export default defineApiHandler(async (event) => {
  const ctx = await requirePermission(event, PERMISSIONS.SETTING_MANAGE)
  const organizationId = requireOrganization(ctx)

  const values = await settingService.reset(organizationId)

  auditAsync(event, {
    organizationId,
    userId: ctx.userId,
    action: AUDIT_ACTIONS.SETTING_CHANGED,
    entity: 'SystemSetting',
    entityId: null,
    newData: { reset: true },
  })

  return ok(values, 'Pengaturan dikembalikan ke bawaan')
})
