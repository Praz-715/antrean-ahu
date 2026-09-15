import { prisma } from '../utils/prisma'
import { errors } from '../utils/response'
import { parseServiceDate, serviceDateString, tzOffsetString } from '../utils/datetime'

export interface DashboardSummary {
  serviceDate: string
  event: { id: string, name: string, status: string, timezone: string }
  totals: {
    visitors: number
    queues: number
    waiting: number
    calledOrServing: number
    completed: number
    skipped: number
    cancelled: number
    noShow: number
  }
  averages: {
    waitingSeconds: number | null
    serviceSeconds: number | null
    /** jumlah antrean yang benar-benar sempat dilayani — dasar rata-rata waktu layanan */
    servedCount: number
    satisfaction: number | null
    ratingCount: number
  }
  byQueueType: Array<{
    id: string
    code: string
    name: string
    color: string
    total: number
    waiting: number
    completed: number
    skipped: number
    currentNumber: string | null
  }>
  hourly: Array<{ hour: number, count: number }>
}

export const statsService = {
  /**
   * Ringkasan operasional satu event pada satu service date (§24).
   *
   * Jumlah query tetap, tidak tumbuh mengikuti banyaknya jenis antrean.
   */
  async dashboard(organizationId: string, eventId: string, dateStr?: string): Promise<DashboardSummary> {
    const event = await prisma.event.findFirst({
      where: { id: eventId, organizationId, deletedAt: null },
      select: { id: true, name: true, status: true, timezone: true },
    })
    if (!event) throw errors.notFound('Event tidak ditemukan')

    const serviceDate = dateStr ?? serviceDateString(event.timezone)
    const date = parseServiceDate(serviceDate)
    const scope = { eventId, serviceDate: date, deletedAt: null }
    // Jam pada grafik harus mengikuti zona waktu event; created_at disimpan UTC (§50).
    const offset = tzOffsetString(event.timezone, date)

    const [grouped, queueTypes, waitingAgg, serviceAgg, ratings, visitorRows, hourlyRows, active] = await Promise.all([
      prisma.queue.groupBy({
        by: ['queueTypeId', 'status'],
        where: scope,
        _count: { _all: true },
      }),
      prisma.queueType.findMany({
        where: { eventId, deletedAt: null },
        orderBy: { displayOrder: 'asc' },
        select: { id: true, code: true, name: true, color: true },
      }),
      prisma.queue.aggregate({
        where: { ...scope, status: 'COMPLETED' },
        _avg: { waitingSeconds: true },
      }),
      // Rata-rata waktu layanan hanya dari antrean yang benar-benar sempat dilayani.
      // Antrean yang tertutup otomatis saat operator menekan NEXT (pengunjung tidak
      // datang) tidak pernah berstatus SERVING, jadi tidak boleh ikut menggerus angka.
      prisma.queue.aggregate({
        where: { ...scope, status: 'COMPLETED', servingStartedAt: { not: null } },
        _avg: { serviceSeconds: true },
        _count: { _all: true },
      }),
      prisma.testimonial.aggregate({
        where: { eventId, queue: { serviceDate: date } },
        _avg: { rating: true },
        _count: { _all: true },
      }),
      prisma.$queryRaw<Array<{ total: bigint | number }>>`
        SELECT COUNT(DISTINCT visitor_id) AS total
        FROM queues
        WHERE event_id = ${eventId} AND service_date = ${serviceDate}
          AND deleted_at IS NULL AND visitor_id IS NOT NULL
      `,
      prisma.$queryRaw<Array<{ hour: number, count: bigint | number }>>`
        SELECT HOUR(CONVERT_TZ(created_at, '+00:00', ${offset})) AS hour, COUNT(*) AS count
        FROM queues
        WHERE event_id = ${eventId} AND service_date = ${serviceDate} AND deleted_at IS NULL
        GROUP BY hour
        ORDER BY hour
      `,
      prisma.queue.findMany({
        where: { ...scope, status: { in: ['CALLED', 'SERVING'] } },
        orderBy: { lastCalledAt: 'desc' },
        select: { queueTypeId: true, queueNumber: true },
      }),
    ])

    const totalOf = (status: string) =>
      grouped.filter(g => g.status === status).reduce((sum, g) => sum + g._count._all, 0)

    const currentByType = new Map<string, string>()
    for (const row of active) {
      if (!currentByType.has(row.queueTypeId)) currentByType.set(row.queueTypeId, row.queueNumber)
    }

    const byQueueType = queueTypes.map((qt) => {
      const rows = grouped.filter(g => g.queueTypeId === qt.id)
      const pick = (status: string) => rows.find(r => r.status === status)?._count._all ?? 0
      return {
        id: qt.id,
        code: qt.code,
        name: qt.name,
        color: qt.color,
        total: rows.reduce((sum, r) => sum + r._count._all, 0),
        waiting: pick('WAITING'),
        completed: pick('COMPLETED'),
        skipped: pick('SKIPPED'),
        currentNumber: currentByType.get(qt.id) ?? null,
      }
    })

    return {
      serviceDate,
      event,
      totals: {
        // pengunjung unik, bukan jumlah antrean (§24 memisahkan keduanya)
        visitors: Number(visitorRows[0]?.total ?? 0),
        queues: grouped.reduce((sum, g) => sum + g._count._all, 0),
        waiting: totalOf('WAITING'),
        calledOrServing: totalOf('CALLED') + totalOf('SERVING'),
        completed: totalOf('COMPLETED'),
        skipped: totalOf('SKIPPED'),
        cancelled: totalOf('CANCELLED'),
        noShow: totalOf('NO_SHOW'),
      },
      averages: {
        waitingSeconds: waitingAgg._avg.waitingSeconds ?? null,
        serviceSeconds: serviceAgg._avg.serviceSeconds ?? null,
        servedCount: serviceAgg._count._all,
        satisfaction: ratings._avg.rating ?? null,
        ratingCount: ratings._count._all,
      },
      byQueueType,
      hourly: hourlyRows.map(r => ({ hour: Number(r.hour), count: Number(r.count) })),
    }
  },
}
