import { z } from 'zod'
import { defineApiHandler } from '../../../../utils/handler'
import { ok } from '../../../../utils/response'
import { requireOrganization, requirePermission } from '../../../../utils/context'
import { publishService } from '../../../../services/publish.service'
import { auditAsync, AUDIT_ACTIONS } from '../../../../utils/audit'
import { PERMISSIONS } from '../../../../../shared/constants/permissions'

const bodySchema = z.object({ rotateCode: z.boolean().default(false) }).default({ rotateCode: false })

export default defineApiHandler(async (event) => {
  const ctx = await requirePermission(event, PERMISSIONS.PUBLIC_PAGE_MANAGE)
  const organizationId = requireOrganization(ctx)
  const id = getRouterParam(event, 'id') as string
  const { rotateCode } = bodySchema.parse(await readBody(event).catch(() => ({})))

  const qr = await publishService.regenerateQr(organizationId, id, rotateCode)
  auditAsync(event, {
    organizationId,
    userId: ctx.userId,
    action: AUDIT_ACTIONS.QR_REGENERATED,
    entity: 'PublicPage',
    entityId: id,
    newData: { version: qr.version, rotateCode },
  })

  return ok(qr, rotateCode ? 'QR & tautan baru dibuat' : 'QR diperbarui')
})
