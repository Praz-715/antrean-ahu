import { z } from 'zod'
import { defineApiHandler } from '../../../../utils/handler'
import { ok } from '../../../../utils/response'
import { requireOrganization, requirePermission } from '../../../../utils/context'
import { displayTemplateService } from '../../../../services/display-template.service'
import { emitDisplayReload } from '../../../../realtime/emitters'
import { auditAsync, AUDIT_ACTIONS } from '../../../../utils/audit'
import { idSchema } from '../../../../../shared/schemas/common'
import { WIDGET_TYPES } from '../../../../../shared/constants/widgets'
import { PERMISSIONS } from '../../../../../shared/constants/permissions'

const widgetSchema = z.object({
  type: z.enum(WIDGET_TYPES),
  x: z.number().int().min(-2000).max(4000),
  y: z.number().int().min(-2000).max(4000),
  width: z.number().int().min(20).max(4000),
  height: z.number().int().min(20).max(4000),
  zIndex: z.number().int().min(0).max(999).default(1),
  config: z.record(z.string(), z.unknown()).optional().nullable(),
  style: z.record(z.string(), z.unknown()).optional().nullable(),
  animation: z.string().max(40).optional().nullable(),
  isVisible: z.boolean().default(true),
  mediaId: idSchema.optional().nullable(),
  playlistId: idSchema.optional().nullable(),
})

const bodySchema = z.object({ widgets: z.array(widgetSchema).max(60) })

/** Simpan seluruh tata letak kanvas sekaligus, lalu suruh layar terkait memuat ulang. */
export default defineApiHandler(async (event) => {
  const ctx = await requirePermission(event, PERMISSIONS.DISPLAY_TEMPLATE_MANAGE)
  const organizationId = requireOrganization(ctx)
  const id = getRouterParam(event, 'id') as string
  const { widgets } = bodySchema.parse(await readBody(event))

  const template = await displayTemplateService.replaceWidgets(organizationId, id, widgets)

  // layar yang memakai template ini harus mengambil tata letak barunya
  for (const device of template.devices) emitDisplayReload(device.id)

  auditAsync(event, {
    organizationId,
    userId: ctx.userId,
    action: AUDIT_ACTIONS.DISPLAY_TEMPLATE_UPDATED,
    entity: 'DisplayTemplate',
    entityId: id,
    newData: { widgetCount: widgets.length },
  })

  return ok(template, 'Tata letak disimpan')
})
