import { z } from 'zod'
import { defineApiHandler } from '../../../utils/handler'
import { errors, ok } from '../../../utils/response'
import { requireOrganization, requirePermission } from '../../../utils/context'
import { prisma } from '../../../utils/prisma'
import { emitDisplayReload } from '../../../realtime/emitters'
import { auditAsync, AUDIT_ACTIONS } from '../../../utils/audit'
import { idSchema } from '../../../../shared/schemas/common'
import { PERMISSIONS } from '../../../../shared/constants/permissions'

const bodySchema = z.object({
  name: z.string().trim().min(2).max(150).optional(),
  templateId: idSchema.optional().nullable(),
  queueTypeId: idSchema.optional().nullable(),
})

export default defineApiHandler(async (event) => {
  const ctx = await requirePermission(event, PERMISSIONS.DISPLAY_MANAGE)
  const organizationId = requireOrganization(ctx)
  const id = getRouterParam(event, 'id') as string
  const input = bodySchema.parse(await readBody(event))

  const device = await prisma.displayDevice.findFirst({
    where: { id, deletedAt: null, event: { organizationId, deletedAt: null } },
    select: { id: true, eventId: true, type: true },
  })
  if (!device) throw errors.notFound('Perangkat display tidak ditemukan')

  if (input.templateId) {
    const template = await prisma.displayTemplate.findFirst({
      where: { id: input.templateId, organizationId, deletedAt: null },
      select: { id: true },
    })
    if (!template) throw errors.notFound('Template display tidak ditemukan')
  }

  if (input.queueTypeId) {
    const queueType = await prisma.queueType.findFirst({
      where: { id: input.queueTypeId, eventId: device.eventId, deletedAt: null },
      select: { id: true },
    })
    if (!queueType) throw errors.notFound('Jenis antrean tidak ditemukan pada event ini')
  }

  const updated = await prisma.displayDevice.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.templateId !== undefined ? { templateId: input.templateId } : {}),
      ...(input.queueTypeId !== undefined ? { queueTypeId: input.queueTypeId } : {}),
    },
    include: {
      queueType: { select: { id: true, code: true, name: true } },
      template: { select: { id: true, name: true } },
    },
  })

  emitDisplayReload(id)

  auditAsync(event, {
    organizationId,
    userId: ctx.userId,
    action: AUDIT_ACTIONS.DISPLAY_UPDATED,
    entity: 'DisplayDevice',
    entityId: id,
    newData: input,
  })

  return ok(updated, 'Perangkat display diperbarui')
})
