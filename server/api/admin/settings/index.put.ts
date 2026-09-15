import { z } from 'zod'
import { defineApiHandler } from '../../../utils/handler'
import { ok } from '../../../utils/response'
import { requireOrganization, requirePermission } from '../../../utils/context'
import { settingService } from '../../../services/setting.service'
import { auditAsync, AUDIT_ACTIONS } from '../../../utils/audit'
import { PERMISSIONS } from '../../../../shared/constants/permissions'

const bodySchema = z.object({
  values: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
})

export default defineApiHandler(async (event) => {
  const ctx = await requirePermission(event, PERMISSIONS.SETTING_MANAGE)
  const organizationId = requireOrganization(ctx)
  const { values } = bodySchema.parse(await readBody(event))

  const before = await settingService.getAll(organizationId)
  const result = await settingService.update(organizationId, ctx.userId, values)

  auditAsync(event, {
    organizationId,
    userId: ctx.userId,
    action: AUDIT_ACTIONS.SETTING_CHANGED,
    entity: 'SystemSetting',
    entityId: null,
    oldData: Object.fromEntries(result.changed.map(key => [key, before[key]])),
    newData: Object.fromEntries(result.changed.map(key => [key, result.values[key]])),
  })

  return ok(result.values, 'Pengaturan disimpan')
})
