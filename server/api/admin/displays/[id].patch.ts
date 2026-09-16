import { z } from 'zod'
import { defineApiHandler } from '../../../utils/handler'
import { errors, ok } from '../../../utils/response'
import { requireOrganization, requirePermission } from '../../../utils/context'
import { prisma } from '../../../utils/prisma'
import { emitDisplayReload } from '../../../realtime/emitters'
import { displayService } from '../../../services/display.service'
import { auditAsync, AUDIT_ACTIONS } from '../../../utils/audit'
import { idSchema } from '../../../../shared/schemas/common'
import { DISPLAY_TYPES, MAX_SUBSET_QUEUE_TYPES, parseQueueTypeIds } from '../../../../shared/constants/display'
import { PERMISSIONS } from '../../../../shared/constants/permissions'

const bodySchema = z.object({
  name: z.string().trim().min(2).max(150).optional(),
  templateId: idSchema.optional().nullable(),
  type: z.enum(DISPLAY_TYPES).optional(),
  queueTypeId: idSchema.optional().nullable(),
  /** Tipe SUBSET: urutan larik ini adalah urutan tampil di papan. */
  queueTypeIds: z.array(idSchema).max(MAX_SUBSET_QUEUE_TYPES).optional().nullable(),
})

export default defineApiHandler(async (event) => {
  const ctx = await requirePermission(event, PERMISSIONS.DISPLAY_MANAGE)
  const organizationId = requireOrganization(ctx)
  const id = getRouterParam(event, 'id') as string
  const input = bodySchema.parse(await readBody(event))

  const device = await prisma.displayDevice.findFirst({
    where: { id, deletedAt: null, event: { organizationId, deletedAt: null } },
    select: { id: true, eventId: true, type: true, queueTypeId: true, queueTypeIds: true },
  })
  if (!device) throw errors.notFound('Perangkat display tidak ditemukan')

  /**
   * Tipe akhir dihitung lebih dulu, lalu dipakai memeriksa SELURUH syaratnya.
   *
   * Tanpa ini setiap kolom diperiksa sendiri-sendiri dan perangkat bisa berakhir
   * pada keadaan yang mustahil — QUEUE_TYPE tanpa jenis antrean, atau SUBSET
   * dengan daftar kosong. Keadaan itu tidak melempar galat, ia hanya membuat
   * layarnya menampilkan papan kosong tanpa sebab yang kelihatan.
   */
  const tipe = input.type ?? device.type
  const idTunggal = input.queueTypeId !== undefined ? input.queueTypeId : device.queueTypeId
  const idJamak = input.queueTypeIds !== undefined
    ? parseQueueTypeIds(input.queueTypeIds)
    : parseQueueTypeIds(device.queueTypeIds)

  if (tipe === 'QUEUE_TYPE' && !idTunggal) {
    throw errors.validation('Display per layanan wajib memilih jenis antrean')
  }
  if (tipe === 'SUBSET' && !idJamak.length) {
    throw errors.validation('Display beberapa layanan wajib memilih minimal satu jenis antrean')
  }
  if (tipe === 'SUBSET') {
    await displayService.assertQueueTypesInEvent(device.eventId, idJamak)
  }

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
      /*
       * Kolom yang tidak berlaku untuk tipe akhirnya DIKOSONGKAN, bukan dibiarkan.
       * Nilai sisa dari tipe sebelumnya akan hidup kembali begitu tipenya diubah
       * balik — mengubah GLOBAL → SUBSET → GLOBAL tidak boleh menyisakan daftar
       * layanan yang tak terlihat di antarmuka tetapi masih tersimpan.
       */
      ...(input.type !== undefined ? { type: input.type } : {}),
      queueTypeId: tipe === 'QUEUE_TYPE' ? idTunggal : null,
      queueTypeIds: tipe === 'SUBSET' ? idJamak : null,
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
