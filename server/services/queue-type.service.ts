import { prisma } from '../utils/prisma'
import { storage } from '../utils/storage'
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
    const items = await prisma.queueType.findMany({
      where: { eventId, deletedAt: null },
      orderBy: [{ displayOrder: 'asc' }, { code: 'asc' }],
      // Operator tidak lagi terikat langsung ke jenis antrean; yang bisa dihitung
      // adalah jumlah LOKET yang melayaninya (§12).
      include: {
        _count: { select: { queues: true, counterServices: true } },
        logoMedia: { select: { filePath: true } },
      },
    })

    // Tautan logonya dirakit di sini; `filePath` adalah letak berkas di penyimpanan
    // dan bukan sesuatu yang bisa dipasang klien ke atribut src.
    return items.map(({ logoMedia, ...qt }) => ({
      ...qt,
      logoUrl: logoMedia ? storage.publicUrl(logoMedia.filePath) : null,
    }))
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
        logoMediaId: input.logoMediaId ?? null,
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

    /**
     * Mengubah format nomor saat sudah ada antrean berjalan hari ini akan membuat
     * penomoran tidak konsisten dalam satu service date.
     *
     * Yang dibandingkan hanya field yang benar-benar dikirim: field yang absen
     * berarti "tidak diubah", bukan "diubah menjadi undefined". Tanpa ini,
     * menyimpan warna atau logo saja sudah ikut terbentur penjagaan ini.
     */
    const formatBerubah
      = (input.numberFormat !== undefined && input.numberFormat !== existing.numberFormat)
        || (input.prefix !== undefined && input.prefix !== existing.prefix)
        || (input.padding !== undefined && input.padding !== existing.padding)

    if (formatBerubah) {
      const activeToday = await prisma.queue.count({
        where: { queueTypeId: id, status: { in: ['WAITING', 'CALLED', 'SERVING'] }, deletedAt: null },
      })
      if (activeToday > 0) {
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
        ...(input.logoMediaId !== undefined ? { logoMediaId: input.logoMediaId } : {}),
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

    /**
     * Loket yang masih melayani jenis antrean ini harus dilepas lebih dulu.
     *
     * Penghapusannya HALUS (`deletedAt`), jadi `onDelete: Cascade` pada
     * `counter_services` tidak pernah berjalan dan barisnya tertinggal menunjuk
     * jenis antrean yang sudah tidak ada. Akibatnya berantai: loketnya masih
     * menampilkan layanan itu, dan menyimpan ulang daftar layanannya ditolak
     * karena id tersebut tidak lagi lolos pemeriksaan "milik event ini".
     *
     * Barisnya TIDAK dibersihkan otomatis di sini. Satu loket yang kehilangan
     * seluruh layanannya berhenti bisa memanggil siapa pun, dan operator yang
     * duduk di situ ikut kehilangan cakupan kerjanya — keputusan sebesar itu
     * harus diambil admin secara sadar, bukan menjadi efek samping dari menghapus
     * satu jenis antrean.
     *
     * Nama loketnya disebutkan supaya admin tahu ke mana harus pergi; tanpa itu
     * pesannya hanya memberitahu bahwa ada masalah, bukan di mana.
     */
    const dipakaiLoket = await prisma.counterService.findMany({
      where: { queueTypeId: id },
      select: { counter: { select: { name: true } } },
      orderBy: { counter: { name: 'asc' } },
      take: 10,
    })
    if (dipakaiLoket.length) {
      const nama = dipakaiLoket.map(r => r.counter.name)
      throw errors.conflict(
        ERROR_CODES.CONFLICT,
        `Jenis antrean ini masih dilayani ${nama.length} loket (${nama.join(', ')}). `
        + 'Keluarkan dulu dari daftar layanan loket tersebut.',
      )
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
        /*
         * Jenis antrean yang sudah dihapus disaring di sini.
         *
         * Penghapusannya halus, jadi barisnya masih ada di `counter_services`.
         * Tanpa saringan ini layanan yang sudah tidak ada tetap tampil di kartu
         * loket, lalu ikut terkirim saat daftarnya disimpan ulang — dan ditolak.
         * Saringan ini juga yang memulihkan loket yang sudah lebih dulu rusak
         * sebelum penghapusannya diblokir.
         */
        services: {
          where: { queueType: { deletedAt: null } },
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
      /**
       * Dua sebab kegagalan dipisahkan.
       *
       * Sebelumnya keduanya dijawab "bukan milik event loket ini" — keliru dan
       * menyesatkan untuk jenis antrean yang MEMANG milik event itu tetapi sudah
       * dihapus, yang justru kasus yang paling sering terjadi.
       */
      const cocok = await prisma.queueType.findMany({
        where: { id: { in: unique }, eventId: counter.eventId },
        select: { id: true, name: true, deletedAt: true },
      })

      const terhapus = cocok.filter(t => t.deletedAt).map(t => t.name)
      if (terhapus.length) {
        throw errors.validation(
          `Jenis antrean berikut sudah dihapus dan tidak bisa dipasang lagi: ${terhapus.join(', ')}`,
        )
      }
      if (cocok.length !== unique.length) {
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
