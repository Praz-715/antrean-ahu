import { z } from 'zod'
import { defineApiHandler } from '../../../utils/handler'
import { ok } from '../../../utils/response'
import { requireOrganization, requirePermission } from '../../../utils/context'
import { displayService } from '../../../services/display.service'
import { auditAsync, AUDIT_ACTIONS } from '../../../utils/audit'
import { idSchema } from '../../../../shared/schemas/common'
import { DISPLAY_TYPES, MAX_SUBSET_QUEUE_TYPES } from '../../../../shared/constants/display'
import { PERMISSIONS } from '../../../../shared/constants/permissions'

const bodySchema = z.object({
  eventId: idSchema,
  name: z.string().trim().min(2, 'Nama minimal 2 karakter').max(150),
  type: z.enum(DISPLAY_TYPES).default('GLOBAL'),
  queueTypeId: idSchema.optional().nullable(),
  /** Tipe SUBSET: urutan larik ini adalah urutan tampil di papan. */
  queueTypeIds: z.array(idSchema).max(MAX_SUBSET_QUEUE_TYPES).optional().nullable(),
})

export default defineApiHandler(async (event) => {
  const ctx = await requirePermission(event, PERMISSIONS.DISPLAY_MANAGE)
  const organizationId = requireOrganization(ctx)
  const input = bodySchema.parse(await readBody(event))

  const device = await displayService.create(organizationId, input)

  auditAsync(event, {
    organizationId,
    userId: ctx.userId,
    action: AUDIT_ACTIONS.DISPLAY_UPDATED,
    entity: 'DisplayDevice',
    entityId: device.id,
    newData: { name: device.name, deviceCode: device.deviceCode, type: device.type, queueTypeIds: device.queueTypeIds },
  })

  setResponseStatus(event, 201)
  return ok(device, 'Perangkat display dibuat')
})
