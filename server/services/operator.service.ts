import type { Prisma, QueueStatus } from '../../generated/prisma/client'
import { prisma } from '../utils/prisma'
import { newId } from '../utils/id'
import { errors } from '../utils/response'
import { ERROR_CODES } from '../../shared/constants/errors'
import { formatServiceDate, resolveServiceDate, secondsBetween } from '../utils/datetime'
import { settingService } from './setting.service'
import { SETTING_KEYS } from '../../shared/constants/settings'
import { QUEUE_PRIORITY } from '../../shared/constants/queue'

type Tx = Prisma.TransactionClient

/**
 * Transisi status yang sah (§11, §57.7–§57.9).
 * Satu-satunya tempat aturan ini didefinisikan; seluruh aksi operator melewatinya.
 */
const TRANSITIONS: Record<QueueStatus, QueueStatus[]> = {
  WAITING: ['CALLED', 'SERVING', 'CANCELLED', 'SKIPPED'],
  CALLED: ['SERVING', 'SKIPPED', 'COMPLETED', 'NO_SHOW', 'CANCELLED'],
  SERVING: ['COMPLETED', 'SKIPPED', 'CANCELLED'],
  SKIPPED: ['CALLED', 'SERVING', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: ['CALLED'],
}

export function assertTransition(from: QueueStatus, to: QueueStatus) {
  if (from === to) return
  if (!TRANSITIONS[from]?.includes(to)) {
    const message = from === 'COMPLETED'
      ? 'Antrean sudah selesai dan tidak dapat diubah'
      : from === 'CANCELLED'
        ? 'Antrean sudah dibatalkan'
        : `Antrean berstatus ${from} tidak dapat diubah menjadi ${to}`
    throw errors.conflict(ERROR_CODES.QUEUE_INVALID_TRANSITION, message)
  }
}

const QUEUE_INCLUDE = {
  queueType: { select: { id: true, code: true, name: true, color: true, estServiceSeconds: true } },
  counter: { select: { id: true, code: true, name: true } },
  operator: { select: { id: true, name: true } },
  visitor: { select: { id: true, fullName: true, phone: true, data: true } },
  event: { select: { id: true, name: true, organizationId: true, timezone: true, status: true, allowFinishAfterClose: true } },
} satisfies Prisma.QueueInclude

async function logQueueEvent(
  tx: Tx,
  params: { queueId: string, eventType: string, previousStatus?: QueueStatus | null, newStatus?: QueueStatus | null, operatorId?: string | null, metadata?: Record<string, unknown> },
) {
  await tx.queueEvent.create({
    data: {
      id: newId(),
      queueId: params.queueId,
      eventType: params.eventType,
      previousStatus: params.previousStatus ?? null,
      newStatus: params.newStatus ?? null,
      operatorId: params.operatorId ?? null,
      metadata: (params.metadata ?? undefined) as never,
    },
  })
}

/**
 * Penempatan operator: loketnya beserta layanan yang dilayani loket itu (§12, §28).
 *
 * Cakupan operator TIDAK lagi disimpan per jenis antrean. Ia duduk di satu loket,
 * dan loket itulah yang menentukan layanan apa saja yang boleh ia tangani. Karena
 * loket dimiliki satu event, cakupannya otomatis terkurung pada event tersebut.
 */
async function findPlacement(userId: string) {
  return prisma.operatorAssignment.findUnique({
    where: { userId },
    include: {
      counter: {
        include: {
          event: { select: { id: true, name: true, status: true, timezone: true } },
          services: {
            orderBy: { displayOrder: 'asc' },
            include: {
              queueType: {
                select: { id: true, code: true, name: true, color: true, icon: true, eventId: true, estServiceSeconds: true, isActive: true, deletedAt: true },
              },
            },
          },
        },
      },
    },
  })
}

/** Bentuk yang dipakai seluruh aksi operator: layanan + loket tempat ia duduk. */
type ServiceAccess = {
  queueType: { id: string, code: string, name: string, eventId: string, estServiceSeconds: number }
  counter: { id: string, code: string, name: string } | null
}

/** Pastikan loket operator memang melayani jenis antrean tersebut (§57.5). */
async function requireAssignment(userId: string, queueTypeId: string): Promise<ServiceAccess> {
  const placement = await findPlacement(userId)
  if (!placement) throw errors.forbidden('Anda belum ditempatkan pada loket mana pun')

  const service = placement.counter.services.find(
    row => row.queueTypeId === queueTypeId && !row.queueType.deletedAt,
  )
  if (!service) {
    throw errors.forbidden('Loket Anda tidak melayani jenis antrean ini')
  }

  return {
    queueType: service.queueType,
    counter: { id: placement.counter.id, code: placement.counter.code, name: placement.counter.name },
  }
}

/**
 * Penjagaan penempatan dengan pengecualian untuk pengawas lintas layanan.
 *
 * Tanpa pengecualian ini ada jalan buntu yang nyata: satu antrean WAITING pada
 * layanan yang tidak dilayani loket mana pun tidak bisa dibereskan SIAPA PUN —
 * operator ditolak karena bukan layanan loketnya, dan admin ditolak karena tidak
 * duduk di loket mana pun. Antrean itu menggantung selamanya, dan event-nya pun
 * tidak bisa ditutup atau dihapus karena masih ada antrean aktif.
 *
 * Izin `queue.view_all` memang bermakna "lintas assignment" (lihat katalog izin),
 * dan izin aksinya sendiri sudah diperiksa lebih dulu oleh handler. Operator biasa
 * tidak memiliki keduanya, jadi batas kewenangan mereka tidak berubah.
 */
async function requireQueueAccess(userId: string, queueTypeId: string, crossAssignment = false): Promise<ServiceAccess> {
  if (!crossAssignment) return requireAssignment(userId, queueTypeId)

  const placement = await findPlacement(userId)
  const service = placement?.counter.services.find(
    row => row.queueTypeId === queueTypeId && !row.queueType.deletedAt,
  )
  if (placement && service) {
    return {
      queueType: service.queueType,
      counter: { id: placement.counter.id, code: placement.counter.code, name: placement.counter.name },
    }
  }

  // Pengawas boleh bertindak walau tidak duduk di loket mana pun.
  const queueType = await prisma.queueType.findFirst({
    where: { id: queueTypeId, deletedAt: null },
    select: { id: true, code: true, name: true, eventId: true, estServiceSeconds: true },
  })
  if (!queueType) throw errors.notFound('Jenis antrean tidak ditemukan')

  return { queueType, counter: null }
}

export const operatorQueueService = {
  /**
   * Tempat kerja operator: satu loket, beserta layanan yang dilayani loket itu.
   *
   * Bentuknya tetap berupa daftar "penugasan" agar antarmuka operator tidak perlu
   * dirombak — hanya saja isinya kini diturunkan dari loket, sehingga tidak mungkin
   * lagi memuat layanan dari event yang berbeda.
   */
  async workspace(userId: string) {
    const placement = await findPlacement(userId)
    if (!placement) return []

    const counter = placement.counter
    return counter.services
      .filter(row => !row.queueType.deletedAt && row.queueType.isActive)
      .map(row => ({
        id: `${placement.id}:${row.queueTypeId}`,
        isDefault: row.displayOrder === 0,
        queueType: {
          id: row.queueType.id,
          code: row.queueType.code,
          name: row.queueType.name,
          color: row.queueType.color,
          icon: row.queueType.icon,
        },
        counter: { id: counter.id, code: counter.code, name: counter.name },
        event: counter.event,
      }))
  },

  /** Papan kerja satu jenis antrean: sedang dilayani, menunggu, dilewati, riwayat (§13). */
  async board(userId: string, queueTypeId: string) {
    const access = await requireAssignment(userId, queueTypeId)
    const event = await prisma.event.findFirstOrThrow({
      where: { id: access.queueType.eventId },
      select: { id: true, name: true, status: true, timezone: true, allowFinishAfterClose: true },
    })

    const serviceDate = resolveServiceDate(event.timezone)
    const scope = { queueTypeId, serviceDate, deletedAt: null }

    const [current, waiting, skipped, history, counts] = await Promise.all([
      prisma.queue.findFirst({
        where: { ...scope, operatorId: userId, status: { in: ['CALLED', 'SERVING'] } },
        orderBy: { lastCalledAt: 'desc' },
        include: QUEUE_INCLUDE,
      }),
      prisma.queue.findMany({
        where: { ...scope, status: 'WAITING' },
        orderBy: [{ priority: 'desc' }, { sequenceNumber: 'asc' }],
        take: 20,
        include: { visitor: { select: { fullName: true } } },
      }),
      prisma.queue.findMany({
        where: { ...scope, status: 'SKIPPED' },
        orderBy: { sequenceNumber: 'asc' },
        take: 20,
        include: { visitor: { select: { fullName: true } } },
      }),
      prisma.queue.findMany({
        where: { ...scope, status: { in: ['COMPLETED', 'CANCELLED', 'NO_SHOW'] } },
        orderBy: { finishedAt: 'desc' },
        take: 15,
        include: { visitor: { select: { fullName: true } }, operator: { select: { name: true } } },
      }),
      prisma.queue.groupBy({ by: ['status'], where: scope, _count: { _all: true } }),
    ])

    const countOf = (status: string) => counts.find(c => c.status === status)?._count._all ?? 0

    return {
      event,
      serviceDate: formatServiceDate(serviceDate),
      assignment: {
        queueType: access.queueType,
        counter: access.counter,
      },
      current,
      waiting,
      skipped,
      history,
      stats: {
        waiting: countOf('WAITING'),
        completed: countOf('COMPLETED'),
        skipped: countOf('SKIPPED'),
        total: counts.reduce((sum, c) => sum + c._count._all, 0),
      },
    }
  },

  /**
   * Panggil antrean berikutnya (§14).
   *
   * Dua operator TIDAK MUNGKIN mendapat antrean yang sama: baris kandidat dikunci
   * dengan FOR UPDATE SKIP LOCKED, lalu UPDATE-nya masih dijaga `status = 'WAITING'`
   * sehingga wajib mengubah tepat satu baris.
   *
   * Menekan NEXT juga menutup antrean yang sedang dilayani operator ini sebagai
   * COMPLETED — sesuai alur tombol pada dashboard operator.
   */
  async callNext(params: { userId: string, queueTypeId: string, counterId?: string | null }) {
    const access = await requireAssignment(params.userId, params.queueTypeId)
    const event = await prisma.event.findFirstOrThrow({
      where: { id: access.queueType.eventId },
      select: { id: true, organizationId: true, status: true, timezone: true, allowFinishAfterClose: true },
    })

    if (event.status === 'PAUSED') {
      throw errors.badRequest(ERROR_CODES.EVENT_PAUSED, 'Antrean sedang dijeda oleh administrator')
    }
    if (event.status !== 'OPEN' && !event.allowFinishAfterClose) {
      throw errors.badRequest(ERROR_CODES.EVENT_CLOSED, 'Event sudah ditutup')
    }

    const serviceDate = resolveServiceDate(event.timezone)
    const serviceDateStr = formatServiceDate(serviceDate)
    const counterId = params.counterId ?? access.counter?.id ?? null

    return prisma.$transaction(async (tx) => {
      // 1. Tutup antrean yang sedang dilayani operator ini
      const active = await tx.queue.findFirst({
        where: {
          queueTypeId: params.queueTypeId,
          serviceDate,
          operatorId: params.userId,
          status: { in: ['CALLED', 'SERVING'] },
          deletedAt: null,
        },
        orderBy: { lastCalledAt: 'desc' },
      })

      if (active) {
        const startedAt = active.servingStartedAt ?? active.calledAt ?? active.createdAt
        await tx.queue.update({
          where: { id: active.id },
          data: {
            status: 'COMPLETED',
            finishedAt: new Date(),
            serviceSeconds: secondsBetween(startedAt),
          },
        })
        await logQueueEvent(tx, {
          queueId: active.id,
          eventType: 'COMPLETED',
          previousStatus: active.status,
          newStatus: 'COMPLETED',
          operatorId: params.userId,
          metadata: { via: 'NEXT' },
        })
      }

      // 2. Kunci kandidat berikutnya — operator lain langsung melewati baris ini
      const candidates = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM queues
        WHERE queue_type_id = ${params.queueTypeId}
          AND service_date = ${serviceDateStr}
          AND status = 'WAITING'
          AND deleted_at IS NULL
        ORDER BY priority DESC, sequence_number ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      `

      const candidateId = candidates[0]?.id
      if (!candidateId) {
        throw errors.badRequest(ERROR_CODES.QUEUE_EMPTY, 'Tidak ada antrean yang menunggu')
      }

      // 3. Update dengan penjaga status — harus mengenai tepat satu baris
      const affected = await tx.$executeRaw`
        UPDATE queues
        SET status = 'CALLED',
            operator_id = ${params.userId},
            counter_id = ${counterId},
            called_at = UTC_TIMESTAMP(3),
            last_called_at = UTC_TIMESTAMP(3),
            waiting_seconds = TIMESTAMPDIFF(SECOND, created_at, UTC_TIMESTAMP()),
            updated_at = UTC_TIMESTAMP(3)
        WHERE id = ${candidateId} AND status = 'WAITING'
      `

      if (affected !== 1) {
        throw errors.conflict(ERROR_CODES.QUEUE_ALREADY_CALLED, 'Antrean sudah dipanggil operator lain')
      }

      await logQueueEvent(tx, {
        queueId: candidateId,
        eventType: 'CALLED',
        previousStatus: 'WAITING',
        newStatus: 'CALLED',
        operatorId: params.userId,
        metadata: { counterId },
      })

      return tx.queue.findFirstOrThrow({ where: { id: candidateId }, include: QUEUE_INCLUDE })
    }, { timeout: 15_000, isolationLevel: 'ReadCommitted' })
  },

  /**
   * Panggil antrean tertentu — termasuk memanggil ulang yang SKIPPED (§57.7).
   *
   * `priority: true` sekaligus mencatat antreannya sebagai prioritas. Catatan itu
   * ikut ke siaran realtime (layar menampilkan penanda khusus), riwayat antrean,
   * dan ekspor.
   *
   * Yang TIDAK terjadi: urutan NEXT untuk nomor itu tidak lagi berubah, karena
   * penandaan terjadi tepat saat ia dipanggil — dan nomor yang sudah dipanggil
   * bukan lagi WAITING. Kolom `priority` memang kunci urutan pertama NEXT, tetapi
   * itu hanya berpengaruh pada antrean yang masih menunggu.
   */
  async callSpecific(params: {
    userId: string
    queueId: string
    counterId?: string | null
    priority?: boolean
  }) {
    const queue = await prisma.queue.findFirst({ where: { id: params.queueId, deletedAt: null } })
    if (!queue) throw errors.notFound('Antrean tidak ditemukan')

    const access = await requireAssignment(params.userId, queue.queueTypeId)
    assertTransition(queue.status, 'CALLED')

    const counterId = params.counterId ?? access.counter?.id ?? null
    /**
     * `COALESCE` dipakai supaya panggilan biasa tidak menurunkan prioritas yang
     * sudah ada: nomor yang tadi ditandai prioritas tetap prioritas walau kemudian
     * dipanggil ulang lewat tombol biasa.
     */
    const priorityValue = params.priority ? QUEUE_PRIORITY.PRIORITY : null

    return prisma.$transaction(async (tx) => {
      const affected = await tx.$executeRaw`
        UPDATE queues
        SET status = 'CALLED',
            operator_id = ${params.userId},
            counter_id = ${counterId},
            priority = GREATEST(priority, COALESCE(${priorityValue}, priority)),
            called_at = COALESCE(called_at, UTC_TIMESTAMP(3)),
            last_called_at = UTC_TIMESTAMP(3),
            waiting_seconds = COALESCE(waiting_seconds, TIMESTAMPDIFF(SECOND, created_at, UTC_TIMESTAMP())),
            updated_at = UTC_TIMESTAMP(3)
        WHERE id = ${params.queueId} AND status IN ('WAITING', 'SKIPPED', 'NO_SHOW')
      `
      if (affected !== 1) {
        throw errors.conflict(ERROR_CODES.QUEUE_ALREADY_CALLED, 'Antrean sudah ditangani operator lain')
      }

      await logQueueEvent(tx, {
        queueId: params.queueId,
        eventType: 'CALLED',
        previousStatus: queue.status,
        newStatus: 'CALLED',
        operatorId: params.userId,
        metadata: { counterId, manual: true, priority: !!params.priority },
      })

      return tx.queue.findFirstOrThrow({ where: { id: params.queueId }, include: QUEUE_INCLUDE })
    })
  },

  /** Panggil ulang nomor yang sedang dipanggil (§15). */
  async recall(params: { userId: string, queueId: string }) {
    const queue = await prisma.queue.findFirst({
      where: { id: params.queueId, deletedAt: null },
      include: { event: { select: { organizationId: true, settings: true } } },
    })
    if (!queue) throw errors.notFound('Antrean tidak ditemukan')
    await requireAssignment(params.userId, queue.queueTypeId)

    if (!['CALLED', 'SERVING'].includes(queue.status)) {
      throw errors.conflict(ERROR_CODES.QUEUE_INVALID_TRANSITION, 'Hanya antrean yang sedang dipanggil yang bisa dipanggil ulang')
    }

    const settings = await settingService.forEvent(queue.event)
    const limit = Number(settings[SETTING_KEYS.QUEUE_RECALL_LIMIT])
    if (limit > 0 && queue.recallCount >= limit) {
      throw errors.conflict(ERROR_CODES.RECALL_LIMIT_REACHED, `Batas panggil ulang (${limit}x) sudah tercapai`)
    }

    return prisma.$transaction(async (tx) => {
      const updated = await tx.queue.update({
        where: { id: params.queueId },
        data: { recallCount: { increment: 1 }, lastCalledAt: new Date() },
        include: QUEUE_INCLUDE,
      })
      await logQueueEvent(tx, {
        queueId: params.queueId,
        eventType: 'RECALLED',
        previousStatus: queue.status,
        newStatus: queue.status,
        operatorId: params.userId,
        metadata: { recallCount: updated.recallCount },
      })
      return updated
    })
  },

  /** Tandai antrean sedang dilayani (pengunjung sudah datang ke loket). */
  async startServing(params: { userId: string, queueId: string, crossAssignment?: boolean }) {
    return this.transition({
      userId: params.userId,
      queueId: params.queueId,
      to: 'SERVING',
      eventType: 'SERVING',
      data: { servingStartedAt: new Date() },
      crossAssignment: params.crossAssignment,
    })
  },

  async skip(params: { userId: string, queueId: string, crossAssignment?: boolean }) {
    return this.transition({
      userId: params.userId,
      queueId: params.queueId,
      to: 'SKIPPED',
      eventType: 'SKIPPED',
      crossAssignment: params.crossAssignment,
    })
  },

  async complete(params: { userId: string, queueId: string, crossAssignment?: boolean }) {
    const queue = await prisma.queue.findFirst({ where: { id: params.queueId, deletedAt: null } })
    if (!queue) throw errors.notFound('Antrean tidak ditemukan')
    const startedAt = queue.servingStartedAt ?? queue.calledAt ?? queue.createdAt

    return this.transition({
      userId: params.userId,
      queueId: params.queueId,
      to: 'COMPLETED',
      eventType: 'COMPLETED',
      data: { finishedAt: new Date(), serviceSeconds: secondsBetween(startedAt) },
      crossAssignment: params.crossAssignment,
    })
  },

  async noShow(params: { userId: string, queueId: string, crossAssignment?: boolean }) {
    return this.transition({
      userId: params.userId,
      queueId: params.queueId,
      to: 'NO_SHOW',
      eventType: 'NO_SHOW',
      data: { finishedAt: new Date() },
      crossAssignment: params.crossAssignment,
    })
  },

  async cancel(params: { userId: string, queueId: string, reason?: string, crossAssignment?: boolean }) {
    return this.transition({
      userId: params.userId,
      queueId: params.queueId,
      to: 'CANCELLED',
      eventType: 'CANCELLED',
      data: { finishedAt: new Date(), note: params.reason ?? null },
      metadata: { reason: params.reason },
      crossAssignment: params.crossAssignment,
    })
  },

  /** Perubahan status generik dengan penjaga transisi + jejak audit. */
  async transition(params: {
    userId: string
    queueId: string
    to: QueueStatus
    eventType: string
    data?: Prisma.QueueUpdateInput
    metadata?: Record<string, unknown>
    /** Pemegang izin lintas layanan boleh bertindak tanpa penugasan. */
    crossAssignment?: boolean
  }) {
    const queue = await prisma.queue.findFirst({ where: { id: params.queueId, deletedAt: null } })
    if (!queue) throw errors.notFound('Antrean tidak ditemukan')

    await requireQueueAccess(params.userId, queue.queueTypeId, params.crossAssignment)
    assertTransition(queue.status, params.to)

    return prisma.$transaction(async (tx) => {
      const result = await tx.queue.updateMany({
        where: { id: params.queueId, status: queue.status },
        data: {
          status: params.to,
          operatorId: params.userId,
          ...(params.data ?? {}),
        } as Prisma.QueueUpdateManyMutationInput,
      })

      if (result.count !== 1) {
        throw errors.conflict(ERROR_CODES.CONFLICT, 'Status antrean sudah berubah, muat ulang halaman')
      }

      await logQueueEvent(tx, {
        queueId: params.queueId,
        eventType: params.eventType,
        previousStatus: queue.status,
        newStatus: params.to,
        operatorId: params.userId,
        metadata: params.metadata,
      })

      return tx.queue.findFirstOrThrow({ where: { id: params.queueId }, include: QUEUE_INCLUDE })
    })
  },
}
