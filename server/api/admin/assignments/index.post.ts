import { z } from 'zod'
import { defineApiHandler } from '../../../utils/handler'
import { ok } from '../../../utils/response'
import { requireOrganization, requirePermission } from '../../../utils/context'
import { assignmentService } from '../../../services/user.service'
import { auditAsync, AUDIT_ACTIONS } from '../../../utils/audit'
import { idSchema } from '../../../../shared/schemas/common'
import { PERMISSIONS } from '../../../../shared/constants/permissions'

/**
 * Tempatkan operator di sebuah loket (§12, §28).
 *
 * Layanan yang ia tangani TIDAK dikirim di sini — itu properti loket, diatur di
 * halaman Loket. Dengan begitu menambah layanan pada loket otomatis berlaku bagi
 * seluruh operator yang duduk di sana.
 */
const bodySchema = z.object({
  userId: idSchema,
  counterId: idSchema,
  /** Pindahkan operator dari loket lamanya — harus disengaja. */
  moveFromOtherCounter: z.boolean().default(false),
})

export default defineApiHandler(async (event) => {
  const ctx = await requirePermission(event, PERMISSIONS.ASSIGNMENT_MANAGE)
  const organizationId = requireOrganization(ctx)
  const input = bodySchema.parse(await readBody(event))

  const placement = await assignmentService.place(organizationId, input)

  auditAsync(event, {
    organizationId,
    userId: ctx.userId,
    action: AUDIT_ACTIONS.ASSIGNMENT_UPDATED,
    entity: 'OperatorAssignment',
    entityId: placement.id,
    newData: {
      operator: placement.user.name,
      counter: placement.counter.name,
      event: placement.event.name,
      services: placement.services.map(s => s.code),
      movedFrom: placement.movedFrom,
    },
  })

  return ok(
    placement,
    placement.movedFrom
      ? `${placement.user.name} dipindahkan ke ${placement.counter.name}`
      : `${placement.user.name} ditempatkan di ${placement.counter.name}`,
  )
})
