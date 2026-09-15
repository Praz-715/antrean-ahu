import { z } from 'zod'
import { defineApiHandler } from '../../../utils/handler'
import { ok } from '../../../utils/response'
import { requireOrganization, requirePermission } from '../../../utils/context'
import { queueTypeService } from '../../../services/queue-type.service'
import { idSchema } from '../../../../shared/schemas/common'
import { PERMISSIONS } from '../../../../shared/constants/permissions'

const bodySchema = z.object({ eventId: idSchema, ids: z.array(idSchema).min(1) })

export default defineApiHandler(async (event) => {
  const ctx = await requirePermission(event, PERMISSIONS.QUEUE_TYPE_MANAGE)
  const { eventId, ids } = bodySchema.parse(await readBody(event))
  return ok(await queueTypeService.reorder(requireOrganization(ctx), eventId, ids), 'Urutan disimpan')
})
