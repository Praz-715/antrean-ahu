import { prisma } from '../utils/prisma'
import { newId } from '../utils/id'
import { errors } from '../utils/response'
import { ERROR_CODES } from '../../shared/constants/errors'
import { invalidateAuthContext } from '../utils/context'
import type { CreateCounterInput, CreateQueueTypeInput, UpdateQueueTypeInput } from '../../shared/schemas/queue-type'

/** Pastikan event memang milik organisasi si pemanggil sebelum menyentuh anaknya. */
async function assertEventOwnership(organizationId: string, eventId: string) {
  const event = await prisma.event.findFirst({
    where: { id: eventId, organizationId, deletedAt: null },
    select: { id: true },
  })
  if (!event) throw errors.notFound('Event tidak ditemukan')
  return event
}

export const queueTypeService = {
  async list(organizationId: string, eventId: string) {
    await assertEventOwnership(organizationId, eventId)
    return prisma.queueType.findMany({
      where: { eventId, deletedAt: null },
      orderBy: [{ displayOrder: 'asc' }, { code: 'asc' }],
      // Operator tidak lagi terikat langsung ke jenis antrean; yang bisa dihitung
      // adalah jumlah LOKET yang melayaninya (§12).
      include: { _count: { select: { queues: true, counterServices: true } } },
    })
  },

  async getById(organizationId: string, id: string) {
    const queueType = await prisma.queueType.findFirst({
      where: { id, deletedAt: null, event: { organizationId, deletedAt: null } },
      include: { event: { select: { id: true, name: true, timezone: true } } },
    })
    if (!queueType) throw errors.notFound('Jenis antrean tidak ditemukan')
    return queueType
  },

  async create(organizationId: string, input: CreateQueueTypeInput) {
    await assertEventOwnership(organizationId, input.eventId)

    const clash = await prisma.queueType.findFirst({
      where: { eventId: input.eventId, code: input.code },
      select: { id: true, deletedAt: true },
    })
    if (clash) {
      throw errors.conflict(ERROR_CODES.CONFLICT, `Kode "${input.code}" sudah dipakai pada event ini`)
    }

    return prisma.queueType.create({
      data: {
        id: newId(),
        eventId: input.eventId,
        code: input.code,
        name: input.name,
        description: input.description ?? null,
        prefix: input.prefix,
        startingNumber: input.startingNumber,
        numberFormat: input.numberFormat,
        padding: input.padding,
        color: input.color,
        icon: input.icon ?? null,
        isActive: input.isActive,
        displayOrder: input.displayOrder,
        maxWaiting: input.maxWaiting ?? null,
        estServiceSeconds: input.estServiceSeconds,
      },
    })
  },

  async update(organizationId: string, id: string, input: UpdateQueueTypeInput) {
    const existing = await this.getById(organizationId, id)

    if (input.code && input.code !== existing.code) {
      const clash = await prisma.queueType.findFirst({
        where: { eventId: existing.eventId, code: input.code, id: { not: id } },
        select: { id: true },
      })
      if (clash) throw errors.conflict(ERROR_CODES.CONFLICT, `Kode "${input.code}" sudah dipakai pada event ini`)
    }

    // Mengubah format nomor saat sudah ada antrean berjalan hari ini akan membuat
    // penomoran tidak konsisten dalam satu service date.
    if ((input.numberFormat || input.prefix || input.padding !== undefined) ) {
      const activeToday = await prisma.queue.count({
        where: { queueTypeId: id, status: { in: ['WAITING', 'CALLED', 'SERVING'] }, deletedAt: null },
      })
      if (activeToday > 0 && (input.numberFormat !== existing.numberFormat || input.prefix !== existing.prefix)) {
        throw errors.conflict(
          ERROR_CODES.CONFLICT,
          'Masih ada antrean aktif. Format nomor hanya boleh diubah setelah antrean hari ini selesai.',
        )
      }
    }

    return prisma.queueType.update({
      where: { id },
      data: {
        ...(input.code !== undefined ? { code: input.code } : {}),
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.prefix !== undefined ? { prefix: input.prefix } : {}),
        ...(input.startingNumber !== undefined ? { startingNumber: input.startingNumber } : {}),
        ...(input.numberFormat !== undefined ? { numberFormat: input.numberFormat } : {}),
        ...(input.padding !== undefined ? { padding: input.padding } : {}),
        ...(input.color !== undefined ? { color: input.color } : {}),
        ...(input.icon !== undefined ? { icon: input.icon } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        ...(input.displayOrder !== undefined ? { displayOrder: input.displayOrder } : {}),
        ...(input.maxWaiting !== undefined ? { maxWaiting: input.maxWaiting } : {}),
        ...(input.estServiceSeconds !== undefined ? { estServiceSeconds: input.estServiceSeconds } : {}),
      },
    })
  },

  async softDelete(organizationId: string, id: string) {
    const existing = await this.getById(organizationId, id)

    const active = await prisma.queue.count({
      where: { queueTypeId: id, status: { in: ['WAITING', 'CALLED', 'SERVING'] }, deletedAt: null },
    })
    if (active > 0) {
      throw errors.conflict(ERROR_CODES.CONFLICT, `Masih ada ${active} antrean aktif pada jenis antrean ini`)
    }

    await prisma.queueType.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } })
    return existing
  },

  async reorder(organizationId: string, eventId: string, ids: string[]) {
    await assertEventOwnership(organizationId, eventId)
    await prisma.$transaction(
      ids.map((id, index) =>
        prisma.queueType.updateMany({ where: { id, eventId }, data: { displayOrder: index + 1 } }),
      ),
    )
    return this.list(organizationId, eventId)
  },
}

export const counterService = {
  async list(organizationId: string, eventId: string) {
    await assertEventOwnership(organizationId, eventId)
    const counters = await prisma.counter.findMany({
      where: { eventId },
      orderBy: [{ displayOrder: 'asc' }, { code: 'asc' }],
      include: {
        _count: { select: { assignments: true } },
        services: {
          orderBy: { displayOrder: 'asc' },
          select: { queueType: { select: { id: true, code: true, name: true, color: true, isActive: true } } },
        },
        assignments: { select: { user: { select: { id: true, name: true } } } },
      },
    })

    return counters.map(counter => ({
      ...counter,
      // Layanan & operator loket dipakai halaman Loket sekaligus halaman Penugasan.
      services: counter.services.map(row => row.queueType),
      operators: counter.assignments.map(row => row.user),
      assignments: undefined,
    }))
  },

  async create(organizationId: string, input: CreateCounterInput) {
    await assertEventOwnership(organizationId, input.eventId)

    const clash = await prisma.counter.findFirst({
      where: { eventId: input.eventId, code: input.code },
      select: { id: true },
    })
    if (clash) throw errors.conflict(ERROR_CODES.CONFLICT, `Kode loket "${input.code}" sudah dipakai`)

    return prisma.counter.create({
      data: {
        id: newId(),
        eventId: input.eventId,
        code: input.code,
        name: input.name,
        isActive: input.isActive,
        displayOrder: input.displayOrder,
      },
    })
  },

  async getById(organizationId: string, id: string) {
    const counter = await prisma.counter.findFirst({
      where: { id, event: { organizationId, deletedAt: null } },
    })
    if (!counter) throw errors.notFound('Loket tidak ditemukan')
    return counter
  },

  async update(organizationId: string, id: string, input: Partial<CreateCounterInput>) {
    const existing = await this.getById(organizationId, id)

    if (input.code && input.code !== existing.code) {
      const clash = await prisma.counter.findFirst({
        where: { eventId: existing.eventId, code: input.code, id: { not: id } },
        select: { id: true },
      })
      if (clash) throw errors.conflict(ERROR_CODES.CONFLICT, `Kode loket "${input.code}" sudah dipakai`)
    }

    return prisma.counter.update({
      where: { id },
      data: {
        ...(input.code !== undefined ? { code: input.code } : {}),
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        ...(input.displayOrder !== undefined ? { displayOrder: input.displayOrder } : {}),
      },
    })
  },

  /**
   * Tentukan layanan yang dilayani loket ini.
   *
   * Ditulis ulang seluruhnya dalam satu transaksi: keadaan akhir yang dikirim admin
   * adalah keadaan yang tersimpan, tanpa langkah tambah/hapus yang bisa setengah jalan.
   *
   * Loket tidak boleh dikosongkan selama masih ada operator yang duduk di sana —
   * papan kerjanya akan kosong dan tombol panggil kehilangan sumber antrean.
   */
  async setServices(organizationId: string, id: string, queueTypeIds: string[]) {
    const counter = await this.getById(organizationId, id)
    const unique = [...new Set(queueTypeIds)]

    if (unique.length) {
      const valid = await prisma.queueType.count({
        where: { id: { in: unique }, eventId: counter.eventId, deletedAt: null },
      })
      if (valid !== unique.length) {
        throw errors.validation('Ada jenis antrean yang bukan milik event loket ini')
      }
    }
    else {
      const seated = await prisma.operatorAssignment.count({ where: { counterId: id } })
      if (seated > 0) {
        throw errors.conflict(
          ERROR_CODES.COUNTER_HAS_NO_SERVICE,
          `Ada ${seated} operator yang duduk di loket ini. Pindahkan mereka lebih dulu sebelum layanannya dikosongkan.`,
        )
      }
    }

    await prisma.$transaction([
      prisma.counterService.deleteMany({ where: { counterId: id } }),
      ...(unique.length
        ? [prisma.counterService.createMany({
            data: unique.map((queueTypeId, index) => ({
              id: newId(),
              counterId: id,
              queueTypeId,
              displayOrder: index,
            })),
          })]
        : []),
    ])

    // Cakupan layanan operator berubah — cache konteks izin harus dibuang.
    invalidateAuthContext()

    return prisma.counter.findFirstOrThrow({
      where: { id },
      include: {
        services: {
          orderBy: { displayOrder: 'asc' },
          include: { queueType: { select: { id: true, code: true, name: true, color: true } } },
        },
      },
    })
  },

  async remove(organizationId: string, id: string) {
    const existing = await this.getById(organizationId, id)

    const inUse = await prisma.queue.count({
      where: { counterId: id, status: { in: ['CALLED', 'SERVING'] }, deletedAt: null },
    })
    if (inUse > 0) throw errors.conflict(ERROR_CODES.CONFLICT, 'Loket sedang dipakai melayani antrean')

    /**
     * Operator kini DUDUK di loket (§28), jadi menghapus loket berarti mencabut
     * tempat kerjanya. Database memang akan meng-cascade, tetapi lebih baik admin
     * memindahkan operatornya lebih dulu secara sadar daripada penempatan hilang
     * tanpa ia sempat tahu.
     */
    const seated = await prisma.operatorAssignment.count({ where: { counterId: id } })
    if (seated > 0) {
      throw errors.conflict(
        ERROR_CODES.CONFLICT,
        `Masih ada ${seated} operator yang ditempatkan di loket ini. Pindahkan mereka lebih dulu.`,
      )
    }

    await prisma.counter.delete({ where: { id } })
    return existing
  },
}
