import { z } from 'zod'
import { defineApiHandler } from '../../../../utils/handler'
import { ok } from '../../../../utils/response'
import { requireOrganization, requirePermission } from '../../../../utils/context'
import { counterService } from '../../../../services/queue-type.service'
import { auditAsync, AUDIT_ACTIONS } from '../../../../utils/audit'
import { idSchema } from '../../../../../shared/schemas/common'
import { PERMISSIONS } from '../../../../../shared/constants/permissions'

/**
 * Tentukan layanan yang dilayani sebuah loket (§12).
 *
 * Seluruh daftar dikirim sekaligus — bukan tambah/hapus satu-satu — supaya keadaan
 * akhirnya jelas dan tidak ada langkah yang setengah tersimpan.
 */
const bodySchema = z.object({
  queueTypeIds: z.array(idSchema).max(50),
})

export default defineApiHandler(async (event) => {
  const ctx = await requirePermission(event, PERMISSIONS.COUNTER_MANAGE)
  const organizationId = requireOrganization(ctx)
  const id = getRouterParam(event, 'id') as string
  const { queueTypeIds } = bodySchema.parse(await readBody(event))

  const counter = await counterService.setServices(organizationId, id, queueTypeIds)

  auditAsync(event, {
    organizationId,
    userId: ctx.userId,
    action: AUDIT_ACTIONS.COUNTER_UPDATED,
    entity: 'Counter',
    entityId: id,
    newData: { counter: counter.name, services: counter.services.map(s => s.queueType.code) },
  })

  return ok(counter, 'Layanan loket disimpan')
})
