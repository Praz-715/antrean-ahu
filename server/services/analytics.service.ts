import { Prisma } from '../../generated/prisma/client'
import { prisma } from '../utils/prisma'
import { errors } from '../utils/response'
import { serviceDateString, tzOffsetString } from '../utils/datetime'

export interface AnalyticsFilter {
  eventId: string
  from?: string
  to?: string
  queueTypeId?: string
  operatorId?: string
}

export interface AnalyticsResult {
  range: { from: string, to: string, days: number }
  event: { id: string, name: string, timezone: string }
  totals: {
    queues: number
    visitors: number
    completed: number
    skipped: number
    cancelled: number
    noShow: number
    waiting: number
  }
  averages: {
    waitingSeconds: number | null
    serviceSeconds: number | null
    servedCount: number
    satisfaction: number | null
    ratingCount: number
  }
  daily: Array<{ date: string, total: number, completed: number, skipped: number, avgWaitingSeconds: number | null }>
  hourly: Array<{ hour: number, count: number }>
  byQueueType: Array<{
    id: string
    code: string
    name: string
    color: string
    total: number
    completed: number
    skipped: number
    avgWaitingSeconds: number | null
    avgServiceSeconds: number | null
  }>
  operators: Array<{
    id: string
    name: string
    served: number
    skipped: number
    recalls: number
    avgServiceSeconds: number | null
  }>
  satisfaction: Array<{ rating: number, count: number }>
}

const num = (value: unknown): number => Number(value ?? 0)
const nullableNum = (value: unknown): number | null =>
  value === null || value === undefined ? null : Number(value)

/**
 * Agregasi untuk halaman Analytics & laporan (§24, §25).
 *
 * Seluruh pengelompokan tanggal/jam memakai `CONVERT_TZ` ke timezone event —
 * kolom disimpan UTC, jadi tanpa konversi grafik akan bergeser beberapa jam.
 * Jumlah query tetap: tidak ada loop per jenis antrean maupun per operator.
 */
export const analyticsService = {
  async overview(organizationId: string, filter: AnalyticsFilter): Promise<AnalyticsResult> {
    const event = await prisma.event.findFirst({
      where: { id: filter.eventId, organizationId, deletedAt: null },
      select: { id: true, name: true, timezone: true },
    })
    if (!event) throw errors.notFound('Event tidak ditemukan')

    const to = filter.to ?? serviceDateString(event.timezone)
    const from = filter.from ?? shiftDate(to, -29)
    if (from > to) throw errors.validation('Tanggal awal tidak boleh setelah tanggal akhir')

    const offset = tzOffsetString(event.timezone)
    const scope = Prisma.sql`
      q.event_id = ${filter.eventId}
      AND q.service_date BETWEEN ${from} AND ${to}
      AND q.deleted_at IS NULL
      ${filter.queueTypeId ? Prisma.sql`AND q.queue_type_id = ${filter.queueTypeId}` : Prisma.empty}
      ${filter.operatorId ? Prisma.sql`AND q.operator_id = ${filter.operatorId}` : Prisma.empty}
    `

    const [totalsRow, dailyRows, hourlyRows, typeRows, operatorRows, ratingRows] = await Promise.all([
      prisma.$queryRaw<Array<Record<string, unknown>>>`
        SELECT
          COUNT(*) AS total,
          COUNT(DISTINCT q.visitor_id) AS visitors,
          SUM(q.status = 'COMPLETED') AS completed,
          SUM(q.status = 'SKIPPED') AS skipped,
          SUM(q.status = 'CANCELLED') AS cancelled,
          SUM(q.status = 'NO_SHOW') AS no_show,
          SUM(q.status = 'WAITING') AS waiting,
          AVG(CASE WHEN q.status = 'COMPLETED' THEN q.waiting_seconds END) AS avg_waiting,
          AVG(CASE WHEN q.status = 'COMPLETED' AND q.serving_started_at IS NOT NULL THEN q.service_seconds END) AS avg_service,
          SUM(q.status = 'COMPLETED' AND q.serving_started_at IS NOT NULL) AS served_count
        FROM queues q
        WHERE ${scope}
      `,

      prisma.$queryRaw<Array<Record<string, unknown>>>`
        SELECT
          DATE_FORMAT(q.service_date, '%Y-%m-%d') AS date,
          COUNT(*) AS total,
          SUM(q.status = 'COMPLETED') AS completed,
          SUM(q.status = 'SKIPPED') AS skipped,
          AVG(CASE WHEN q.status = 'COMPLETED' THEN q.waiting_seconds END) AS avg_waiting
        FROM queues q
        WHERE ${scope}
        GROUP BY date
        ORDER BY date
      `,

      prisma.$queryRaw<Array<Record<string, unknown>>>`
        SELECT HOUR(CONVERT_TZ(q.created_at, '+00:00', ${offset})) AS hour, COUNT(*) AS count
        FROM queues q
        WHERE ${scope}
        GROUP BY hour
        ORDER BY hour
      `,

      prisma.$queryRaw<Array<Record<string, unknown>>>`
        SELECT
          qt.id, qt.code, qt.name, qt.color,
          COUNT(q.id) AS total,
          SUM(q.status = 'COMPLETED') AS completed,
          SUM(q.status = 'SKIPPED') AS skipped,
          AVG(CASE WHEN q.status = 'COMPLETED' THEN q.waiting_seconds END) AS avg_waiting,
          AVG(CASE WHEN q.status = 'COMPLETED' AND q.serving_started_at IS NOT NULL THEN q.service_seconds END) AS avg_service
        FROM queue_types qt
        LEFT JOIN queues q ON q.queue_type_id = qt.id
          AND q.service_date BETWEEN ${from} AND ${to}
          AND q.deleted_at IS NULL
        WHERE qt.event_id = ${filter.eventId} AND qt.deleted_at IS NULL
        GROUP BY qt.id, qt.code, qt.name, qt.color, qt.display_order
        ORDER BY qt.display_order
      `,

      prisma.$queryRaw<Array<Record<string, unknown>>>`
        SELECT
          u.id, u.name,
          SUM(q.status = 'COMPLETED') AS served,
          SUM(q.status = 'SKIPPED') AS skipped,
          SUM(q.recall_count) AS recalls,
          AVG(CASE WHEN q.status = 'COMPLETED' AND q.serving_started_at IS NOT NULL THEN q.service_seconds END) AS avg_service
        FROM queues q
        JOIN users u ON u.id = q.operator_id
        WHERE ${scope}
        GROUP BY u.id, u.name
        ORDER BY served DESC
      `,

      prisma.$queryRaw<Array<Record<string, unknown>>>`
        SELECT t.rating, COUNT(*) AS count
        FROM testimonials t
        JOIN queues q ON q.id = t.queue_id
        WHERE ${scope}
        GROUP BY t.rating
        ORDER BY t.rating
      `,
    ])

    const totals = totalsRow[0] ?? {}
    const ratingTotal = ratingRows.reduce((sum, r) => sum + num(r.count), 0)
    const ratingSum = ratingRows.reduce((sum, r) => sum + num(r.rating) * num(r.count), 0)

    return {
      range: { from, to, days: daysBetween(from, to) },
      event,
      totals: {
        queues: num(totals.total),
        visitors: num(totals.visitors),
        completed: num(totals.completed),
        skipped: num(totals.skipped),
        cancelled: num(totals.cancelled),
        noShow: num(totals.no_show),
        waiting: num(totals.waiting),
      },
      averages: {
        waitingSeconds: nullableNum(totals.avg_waiting),
        serviceSeconds: nullableNum(totals.avg_service),
        servedCount: num(totals.served_count),
        satisfaction: ratingTotal ? Number((ratingSum / ratingTotal).toFixed(2)) : null,
        ratingCount: ratingTotal,
      },
      daily: fillMissingDays(from, to, dailyRows),
      hourly: hourlyRows.map(r => ({ hour: num(r.hour), count: num(r.count) })),
      byQueueType: typeRows.map(r => ({
        id: String(r.id),
        code: String(r.code),
        name: String(r.name),
        color: String(r.color),
        total: num(r.total),
        completed: num(r.completed),
        skipped: num(r.skipped),
        avgWaitingSeconds: nullableNum(r.avg_waiting),
        avgServiceSeconds: nullableNum(r.avg_service),
      })),
      operators: operatorRows.map(r => ({
        id: String(r.id),
        name: String(r.name),
        served: num(r.served),
        skipped: num(r.skipped),
        recalls: num(r.recalls),
        avgServiceSeconds: nullableNum(r.avg_service),
      })),
      satisfaction: [1, 2, 3, 4, 5].map(rating => ({
        rating,
        count: num(ratingRows.find(r => num(r.rating) === rating)?.count),
      })),
    }
  },
}

function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function daysBetween(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00.000Z`).getTime()
  const b = new Date(`${to}T00:00:00.000Z`).getTime()
  return Math.round((b - a) / 86_400_000) + 1
}

/** Hari tanpa antrean tetap muncul sebagai nol supaya garis tren tidak putus. */
function fillMissingDays(from: string, to: string, rows: Array<Record<string, unknown>>) {
  const byDate = new Map(rows.map(r => [String(r.date), r]))
  const result: AnalyticsResult['daily'] = []

  for (let date = from; date <= to; date = shiftDate(date, 1)) {
    const row = byDate.get(date)
    result.push({
      date,
      total: num(row?.total),
      completed: num(row?.completed),
      skipped: num(row?.skipped),
      avgWaitingSeconds: nullableNum(row?.avg_waiting),
    })
    if (result.length > 400) break
  }

  return result
}
