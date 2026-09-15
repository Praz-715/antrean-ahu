import type { Prisma } from '../../generated/prisma/client'
import { prisma } from '../utils/prisma'
import { newId, newPublicToken } from '../utils/id'
import { errors } from '../utils/response'
import { ERROR_CODES } from '../../shared/constants/errors'
import { formatQueueNumber } from '../../shared/utils/queue-format'
import { formatServiceDate, resolveServiceDate, serviceDateString } from '../utils/datetime'
import { createLogger } from '../utils/logger'
import { settingService } from './setting.service'
import { SETTING_KEYS } from '../../shared/constants/settings'

const log = createLogger('queue')

type Tx = Prisma.TransactionClient

export interface CreateQueueInput {
  eventId: string
  queueTypeId: string
  source?: 'PUBLIC' | 'KIOSK' | 'OPERATOR' | 'API'
  priority?: number
  note?: string | null
  visitor?: {
    fullName?: string | null
    phone?: string | null
    email?: string | null
    identityNumber?: string | null
    data?: Record<string, unknown>
    fieldValues?: Array<{ formFieldId: string | null, fieldKey: string, value: unknown, type?: string }>
    ipAddress?: string | null
    userAgent?: string | null
  }
}

/**
 * Ambil nomor urut berikutnya secara atomik (§32).
 *
 * Tidak pernah memakai MAX(sequence)+1. Baris queue_counters dikunci eksklusif oleh
 * INSERT ... ON DUPLICATE KEY UPDATE, sehingga request paralel otomatis berbaris.
 */
async function nextSequence(
  tx: Tx,
  eventId: string,
  queueTypeId: string,
  serviceDate: string,
  startingNumber: number,
): Promise<number> {
  await tx.$executeRaw`
    INSERT INTO queue_counters (id, event_id, queue_type_id, service_date, current_number, created_at, updated_at)
    VALUES (${newId()}, ${eventId}, ${queueTypeId}, ${serviceDate}, ${startingNumber}, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))
    ON DUPLICATE KEY UPDATE current_number = current_number + 1, updated_at = UTC_TIMESTAMP(3)
  `

  const rows = await tx.$queryRaw<Array<{ current_number: number }>>`
    SELECT current_number FROM queue_counters
    WHERE event_id = ${eventId} AND queue_type_id = ${queueTypeId} AND service_date = ${serviceDate}
    LIMIT 1
  `

  const value = rows[0]?.current_number
  if (value === undefined) {
    throw errors.badRequest(ERROR_CODES.QUEUE_NUMBER_GENERATION_FAILED, 'Gagal membuat nomor antrean')
  }
  return Number(value)
}

/**
 * Simpan jawaban form ke kolom yang sesuai TIPE FIELD-nya, bukan menebak dari isinya.
 *
 * Menebak dari isi berbahaya: "081234567890" tampak seperti angka padahal itu nomor HP,
 * dan mengubahnya jadi numerik akan menghilangkan angka nol di depan.
 *
 * `value_text` selalu diisi supaya pencarian teks tetap sederhana, sementara
 * `value_number` / `value_date` membuat filter numerik & rentang tanggal benar-benar
 * mungkin — itulah alasan tabel ini memakai bentuk EAV.
 */
function typedFieldValue(value: unknown, type?: string) {
  if (value === null || value === undefined) {
    return { valueText: null }
  }

  if (typeof value === 'object') {
    return { valueText: null, valueJson: value as never }
  }

  const text = String(value).slice(0, 65535)
  const result: {
    valueText: string
    valueNumber?: number
    valueDate?: Date
  } = { valueText: text }

  if (type === 'NUMBER') {
    const parsed = Number(text)
    if (text.trim() !== '' && Number.isFinite(parsed)) result.valueNumber = parsed
  }

  if (type === 'DATE' || type === 'DATETIME') {
    const parsed = new Date(text.length === 10 ? `${text}T00:00:00.000Z` : text)
    if (!Number.isNaN(parsed.getTime())) result.valueDate = parsed
  }

  return result
}

export const queueService = {
  /**
   * Terbitkan satu antrean baru. Seluruh langkah (nomor, visitor, queue, jejak audit)
   * berada dalam satu transaksi; broadcast realtime dilakukan pemanggil setelah commit.
   */
  async create(input: CreateQueueInput) {
    const queueType = await prisma.queueType.findFirst({
      where: { id: input.queueTypeId, eventId: input.eventId, deletedAt: null },
      include: { event: { select: { id: true, organizationId: true, timezone: true, settings: true } } },
    })
    if (!queueType) throw errors.notFound('Jenis antrean tidak ditemukan')
    if (!queueType.isActive) {
      throw errors.badRequest(ERROR_CODES.QUEUE_TYPE_UNAVAILABLE, `Layanan ${queueType.name} sedang tidak tersedia`)
    }

    const tz = queueType.event.timezone
    const serviceDateStr = serviceDateString(tz)
    const serviceDate = resolveServiceDate(tz)

    /**
     * Batas antrean menunggu (§49).
     *
     * Kuota per jenis antrean lebih spesifik, jadi ia yang dipakai bila diisi;
     * batas organisasi hanya menjadi jaring pengaman untuk layanan yang tidak
     * menetapkan kuotanya sendiri.
     */
    const settings = await settingService.forEvent(queueType.event)
    const orgMaxWaiting = Number(settings[SETTING_KEYS.QUEUE_MAX_WAITING])
    const maxWaiting = queueType.maxWaiting && queueType.maxWaiting > 0 ? queueType.maxWaiting : orgMaxWaiting

    if (maxWaiting > 0) {
      const waiting = await prisma.queue.count({
        where: { queueTypeId: queueType.id, serviceDate, status: 'WAITING', deletedAt: null },
      })
      if (waiting >= maxWaiting) {
        throw errors.conflict(
          ERROR_CODES.QUEUE_LIMIT_REACHED,
          `Kuota antrean ${queueType.name} hari ini sudah penuh (${maxWaiting} antrean)`,
        )
      }
    }

    const attempt = async () =>
      prisma.$transaction(async (tx) => {
        const sequence = await nextSequence(
          tx,
          input.eventId,
          queueType.id,
          serviceDateStr,
          queueType.startingNumber,
        )

        const queueNumber = formatQueueNumber(queueType.numberFormat, {
          prefix: queueType.prefix,
          code: queueType.code,
          sequence,
          padding: queueType.padding,
          serviceDate: serviceDateStr,
        })

        let visitorId: string | null = null
        if (input.visitor) {
          const visitor = await tx.visitor.create({
            data: {
              id: newId(),
              organizationId: queueType.event.organizationId,
              eventId: input.eventId,
              fullName: input.visitor.fullName ?? null,
              phone: input.visitor.phone ?? null,
              email: input.visitor.email ?? null,
              identityNumber: input.visitor.identityNumber ?? null,
              data: (input.visitor.data ?? undefined) as never,
              ipAddress: input.visitor.ipAddress ?? null,
              userAgent: input.visitor.userAgent?.slice(0, 500) ?? null,
            },
          })
          visitorId = visitor.id

          const values = input.visitor.fieldValues ?? []
          if (values.length) {
            await tx.visitorFieldValue.createMany({
              data: values.map(v => ({
                id: newId(),
                visitorId: visitor.id,
                formFieldId: v.formFieldId,
                fieldKey: v.fieldKey,
                ...typedFieldValue(v.value, v.type),
              })),
            })
          }
        }

        const queue = await tx.queue.create({
          data: {
            id: newId(),
            organizationId: queueType.event.organizationId,
            eventId: input.eventId,
            queueTypeId: queueType.id,
            visitorId,
            serviceDate,
            sequenceNumber: sequence,
            queueNumber,
            status: 'WAITING',
            priority: input.priority ?? 0,
            publicToken: newPublicToken(),
            source: input.source ?? 'PUBLIC',
            note: input.note ?? null,
          },
          include: {
            queueType: { select: { id: true, code: true, name: true, color: true, estServiceSeconds: true } },
            visitor: { select: { id: true, fullName: true } },
          },
        })

        await tx.queueEvent.create({
          data: {
            id: newId(),
            queueId: queue.id,
            eventType: 'CREATED',
            newStatus: 'WAITING',
            metadata: { source: queue.source, sequence } as never,
          },
        })

        return queue
      }, { timeout: 15_000 })

    // Unique constraint (event, type, service_date, sequence) adalah jaring pengaman
    // terakhir; jika kena, ulangi maksimal 3x.
    for (let i = 0; i < 3; i++) {
      try {
        return await attempt()
      }
      catch (error) {
        const code = (error as { code?: string }).code
        if (code === 'P2002' && i < 2) {
          log.warn('tabrakan nomor antrean, mengulang', { attempt: i + 1 })
          continue
        }
        throw error
      }
    }
    throw errors.badRequest(ERROR_CODES.QUEUE_NUMBER_GENERATION_FAILED, 'Gagal membuat nomor antrean, coba lagi')
  },

  /** Detail antrean untuk pengunjung, diakses lewat token publik (§43). */
  async getByPublicToken(token: string) {
    const queue = await prisma.queue.findFirst({
      where: { publicToken: token, deletedAt: null },
      include: {
        queueType: { select: { id: true, code: true, name: true, color: true, estServiceSeconds: true } },
        counter: { select: { code: true, name: true } },
        operator: { select: { name: true } },
        visitor: { select: { fullName: true } },
        event: { select: { id: true, name: true, timezone: true, status: true, organizationId: true, settings: true } },
        testimonial: { select: { id: true, rating: true, comment: true, createdAt: true } },
      },
    })
    if (!queue) throw errors.notFound('Antrean tidak ditemukan')

    const [settings, ahead, nowServing, activeOperators] = await Promise.all([
      settingService.forEvent(queue.event),
      prisma.queue.count({
        where: {
          queueTypeId: queue.queueTypeId,
          serviceDate: queue.serviceDate,
          status: 'WAITING',
          deletedAt: null,
          OR: [
            { priority: { gt: queue.priority } },
            { priority: queue.priority, sequenceNumber: { lt: queue.sequenceNumber } },
          ],
        },
      }),
      prisma.queue.findFirst({
        where: {
          queueTypeId: queue.queueTypeId,
          serviceDate: queue.serviceDate,
          status: { in: ['CALLED', 'SERVING'] },
          deletedAt: null,
        },
        orderBy: { lastCalledAt: 'desc' },
        select: { queueNumber: true, counter: { select: { name: true } } },
      }),
      /**
       * Jumlah operator yang benar-benar bisa melayani antrean ini = operator yang
       * duduk di loket yang melayani jenis antrean tersebut. Dipakai membagi
       * perkiraan waktu tunggu, jadi angkanya harus mencerminkan loket, bukan
       * daftar penugasan lama.
       */
      prisma.operatorAssignment.count({
        where: { counter: { services: { some: { queueTypeId: queue.queueTypeId } } } },
      }),
    ])

    const isWaiting = queue.status === 'WAITING'
    const estimateSeconds = isWaiting
      ? Math.round((ahead * queue.queueType.estServiceSeconds) / Math.max(1, activeOperators))
      : 0

    return {
      id: queue.id,
      queueNumber: queue.queueNumber,
      status: queue.status,
      priority: queue.priority,
      serviceDate: formatServiceDate(queue.serviceDate),
      createdAt: queue.createdAt,
      calledAt: queue.calledAt,
      lastCalledAt: queue.lastCalledAt,
      recallCount: queue.recallCount,
      publicToken: queue.publicToken,
      visitorName: queue.visitor?.fullName ?? null,
      queueType: queue.queueType,
      counter: queue.counter,
      operatorName: queue.operator?.name ?? null,
      event: {
        id: queue.event.id,
        name: queue.event.name,
        timezone: queue.event.timezone,
        status: queue.event.status,
      },
      testimonial: queue.testimonial,
      /** Form penilaian hanya ditampilkan bila fitur ini memang dinyalakan (§23, §49). */
      ratingEnabled: Boolean(settings[SETTING_KEYS.FEEDBACK_RATING_ENABLED]),
      position: { ahead, estimateSeconds },
      nowServing: nowServing
        ? { queueNumber: nowServing.queueNumber, counterName: nowServing.counter?.name ?? null }
        : null,
    }
  },

  /**
   * Papan status ringkas satu event: nomor yang sedang dipanggil per layanan (§17).
   *
   * Jumlah query TETAP (6) berapa pun banyaknya jenis antrean — bukan per layanan.
   * Papan ini dibaca setiap display pada tiap event antrean sekaligus polling
   * cadangan, jadi biayanya tidak boleh tumbuh mengikuti jumlah layanan.
   */
  /**
   * Papan antrean untuk layar & halaman publik.
   *
   * `visitorFieldKeys` menentukan isian formulir mana yang ikut dikirim untuk
   * antrean yang sedang dipanggil (§18, §19). Daftarnya berasal dari widget pada
   * template display, jadi layar HANYA menerima field yang memang dipasang admin —
   * data pengunjung bisa memuat nomor HP atau nomor identitas, dan tidak ada alasan
   * mengirimkan semuanya ke sebuah TV di ruang tunggu.
   */
  async publicBoard(eventId: string, options?: { visitorFieldKeys?: string[] }) {
    const visitorFieldKeys = [...new Set(options?.visitorFieldKeys ?? [])]
    const event = await prisma.event.findFirst({
      where: { id: eventId, deletedAt: null },
      select: { id: true, name: true, timezone: true, status: true },
    })
    if (!event) throw errors.notFound('Event tidak ditemukan')

    const serviceDate = resolveServiceDate(event.timezone)
    const serviceDateStr = formatServiceDate(serviceDate)

    /**
     * Loket ikut diambil karena layar bisa menampilkan papan PER LOKET (§19):
     * satu jenis antrean sering dilayani 2–4 loket sekaligus, dan pengunjung perlu
     * tahu nomor mana yang sedang dipanggil di loket mana.
     */
    const [queueTypes, counters] = await Promise.all([
      prisma.queueType.findMany({
        where: { eventId, isActive: true, deletedAt: null },
        orderBy: { displayOrder: 'asc' },
        select: { id: true, code: true, name: true, color: true, icon: true },
      }),
      prisma.counter.findMany({
        where: { eventId, isActive: true },
        orderBy: [{ displayOrder: 'asc' }, { code: 'asc' }],
        select: {
          id: true,
          code: true,
          name: true,
          services: {
            orderBy: { displayOrder: 'asc' },
            select: { queueType: { select: { id: true, code: true, name: true, color: true } } },
          },
        },
      }),
    ])

    if (!queueTypes.length) {
      return {
        event,
        serviceDate: serviceDateStr,
        board: [],
        counters: counters.map(c => ({
          id: c.id,
          code: c.code,
          name: c.name,
          services: c.services.map(row => row.queueType),
          current: null,
        })),
      }
    }

    const scope = { eventId, serviceDate, deletedAt: null }

    const [counts, active, waitingRows, lastCompletedRows] = await Promise.all([
      // jumlah per status per layanan
      prisma.queue.groupBy({
        by: ['queueTypeId', 'status'],
        where: scope,
        _count: { _all: true },
      }),
      // antrean yang sedang dipanggil/dilayani — jumlah barisnya sekecil jumlah loket
      prisma.queue.findMany({
        where: { ...scope, status: { in: ['CALLED', 'SERVING'] } },
        orderBy: { lastCalledAt: 'desc' },
        select: {
          queueTypeId: true,
          queueNumber: true,
          status: true,
          recallCount: true,
          priority: true,
          lastCalledAt: true,
          counterId: true,
          counter: { select: { code: true, name: true } },
          visitorId: true,
        },
      }),
      // lima nomor menunggu berikutnya untuk SETIAP layanan dalam satu query
      prisma.$queryRaw<Array<{ queue_type_id: string, queue_number: string }>>`
        SELECT queue_type_id, queue_number FROM (
          SELECT queue_type_id, queue_number,
                 ROW_NUMBER() OVER (PARTITION BY queue_type_id ORDER BY priority DESC, sequence_number ASC) AS rn
          FROM queues
          WHERE event_id = ${eventId} AND service_date = ${serviceDateStr}
            AND status = 'WAITING' AND deleted_at IS NULL
        ) ranked
        WHERE rn <= 5
        ORDER BY queue_type_id, rn
      `,
      // nomor terakhir yang selesai untuk setiap layanan
      prisma.$queryRaw<Array<{ queue_type_id: string, queue_number: string }>>`
        SELECT queue_type_id, queue_number FROM (
          SELECT queue_type_id, queue_number,
                 ROW_NUMBER() OVER (PARTITION BY queue_type_id ORDER BY finished_at DESC) AS rn
          FROM queues
          WHERE event_id = ${eventId} AND service_date = ${serviceDateStr}
            AND status = 'COMPLETED' AND deleted_at IS NULL
        ) ranked
        WHERE rn = 1
      `,
    ])

    const waitingCountByType = new Map<string, number>()
    for (const row of counts) {
      if (row.status === 'WAITING') waitingCountByType.set(row.queueTypeId, row._count._all)
    }

    const currentByType = new Map<string, (typeof active)[number]>()
    for (const row of active) {
      if (!currentByType.has(row.queueTypeId)) currentByType.set(row.queueTypeId, row)
    }

    /**
     * Isian formulir pengunjung untuk antrean yang sedang dipanggil.
     *
     * Diambil dari snapshot `visitors.data` — satu query untuk semua antrean aktif,
     * dan isinya mengikuti formulir saat pengunjung mendaftar (bukan formulir versi
     * sekarang). Hanya kunci yang diminta yang diteruskan.
     */
    const fieldsByQueue = new Map<string, Record<string, string>>()
    if (visitorFieldKeys.length) {
      const visitorIds = [...new Set(active.map(row => row.visitorId).filter((id): id is string => !!id))]
      if (visitorIds.length) {
        const visitors = await prisma.visitor.findMany({
          where: { id: { in: visitorIds } },
          select: { id: true, fullName: true, data: true },
        })

        const byVisitor = new Map(visitors.map(v => [v.id, v]))
        for (const row of active) {
          if (!row.visitorId) continue
          const visitor = byVisitor.get(row.visitorId)
          if (!visitor) continue

          const data = (visitor.data ?? {}) as Record<string, unknown>
          const picked: Record<string, string> = {}
          for (const key of visitorFieldKeys) {
            const raw = data[key]
            const text = Array.isArray(raw) ? raw.join(', ') : raw == null ? '' : String(raw)
            if (text.trim()) picked[key] = text.trim()
          }
          if (Object.keys(picked).length) fieldsByQueue.set(row.queueNumber, picked)
        }
      }
    }

    /**
     * Nomor yang sedang dipegang TIAP loket.
     *
     * Barisnya sudah urut dari panggilan terbaru, jadi yang pertama ditemui untuk
     * sebuah loket adalah yang sedang berjalan di sana. Antrean yang dipanggil tanpa
     * loket (pengawas lintas layanan, §57.6) sengaja dilewati — tidak ada kotak
     * loket yang bisa mewakilinya.
     */
    const currentByCounter = new Map<string, (typeof active)[number]>()
    for (const row of active) {
      if (!row.counterId) continue
      if (!currentByCounter.has(row.counterId)) currentByCounter.set(row.counterId, row)
    }

    const nextByType = new Map<string, string[]>()
    for (const row of waitingRows) {
      const list = nextByType.get(row.queue_type_id) ?? []
      list.push(row.queue_number)
      nextByType.set(row.queue_type_id, list)
    }

    const lastCompletedByType = new Map(lastCompletedRows.map(r => [r.queue_type_id, r.queue_number]))

    const board = queueTypes.map((qt) => {
      const current = currentByType.get(qt.id)
      return {
        queueType: qt,
        current: current
          ? {
              queueNumber: current.queueNumber,
              status: current.status,
              recallCount: current.recallCount,
              priority: current.priority,
              lastCalledAt: current.lastCalledAt,
              counter: current.counter,
              /** Isian formulir pengunjung — hanya field yang diminta pemanggil. */
              fields: fieldsByQueue.get(current.queueNumber) ?? {},
            }
          : null,
        waitingCount: waitingCountByType.get(qt.id) ?? 0,
        nextNumbers: nextByType.get(qt.id) ?? [],
        lastCompleted: lastCompletedByType.get(qt.id) ?? null,
      }
    })

    const queueTypeById = new Map(queueTypes.map(qt => [qt.id, qt]))

    const counterBoard = counters.map((counter) => {
      const current = currentByCounter.get(counter.id)
      const queueType = current ? queueTypeById.get(current.queueTypeId) ?? null : null
      return {
        id: counter.id,
        code: counter.code,
        name: counter.name,
        /** Layanan yang dilayani loket ini — dipakai layar untuk menyaring kotaknya. */
        services: counter.services.map(row => row.queueType),
        current: current
          ? {
              queueNumber: current.queueNumber,
              status: current.status,
              priority: current.priority,
              lastCalledAt: current.lastCalledAt,
              queueType: queueType ? { id: queueType.id, code: queueType.code, name: queueType.name, color: queueType.color } : null,
              fields: fieldsByQueue.get(current.queueNumber) ?? {},
            }
          : null,
      }
    })

    return { event, serviceDate: serviceDateStr, board, counters: counterBoard }
  },
}
