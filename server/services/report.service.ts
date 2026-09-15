import { prisma } from '../utils/prisma'
import { errors } from '../utils/response'
import { formatServiceDate, parseServiceDate, serviceDateString } from '../utils/datetime'
import { analyticsService } from './analytics.service'

export interface DailyReport {
  event: { id: string, name: string, timezone: string }
  organization: { name: string } | null
  serviceDate: string
  generatedAt: string
  totals: {
    visitors: number
    queues: number
    completed: number
    waiting: number
    skipped: number
    cancelled: number
    noShow: number
  }
  averages: { waitingSeconds: number | null, serviceSeconds: number | null, satisfaction: number | null, ratingCount: number }
  byQueueType: Array<{ code: string, name: string, total: number, completed: number, skipped: number, avgWaitingSeconds: number | null }>
  byOperator: Array<{ name: string, served: number, skipped: number, avgServiceSeconds: number | null }>
  hourly: Array<{ hour: number, count: number }>
  busiestHour: { hour: number, count: number } | null
}

/** Laporan siap cetak & sumber data untuk ekspor (§39). */
export const reportService = {
  async daily(organizationId: string, eventId: string, date?: string): Promise<DailyReport> {
    const event = await prisma.event.findFirst({
      where: { id: eventId, organizationId, deletedAt: null },
      select: { id: true, name: true, timezone: true, organization: { select: { name: true } } },
    })
    if (!event) throw errors.notFound('Event tidak ditemukan')

    const serviceDate = date ?? serviceDateString(event.timezone)
    const data = await analyticsService.overview(organizationId, {
      eventId,
      from: serviceDate,
      to: serviceDate,
    })

    const busiest = data.hourly.reduce<{ hour: number, count: number } | null>(
      (best, row) => (!best || row.count > best.count ? row : best),
      null,
    )

    return {
      event: { id: event.id, name: event.name, timezone: event.timezone },
      organization: event.organization,
      serviceDate,
      generatedAt: new Date().toISOString(),
      totals: data.totals,
      averages: {
        waitingSeconds: data.averages.waitingSeconds,
        serviceSeconds: data.averages.serviceSeconds,
        satisfaction: data.averages.satisfaction,
        ratingCount: data.averages.ratingCount,
      },
      byQueueType: data.byQueueType.map(t => ({
        code: t.code,
        name: t.name,
        total: t.total,
        completed: t.completed,
        skipped: t.skipped,
        avgWaitingSeconds: t.avgWaitingSeconds,
      })),
      byOperator: data.operators.map(o => ({
        name: o.name,
        served: o.served,
        skipped: o.skipped,
        avgServiceSeconds: o.avgServiceSeconds,
      })),
      hourly: data.hourly,
      busiestHour: busiest,
    }
  },

  /**
   * Baris data mentah untuk ekspor.
   * Dibaca bertahap (cursor) agar rentang tanggal panjang tidak menahan seluruh
   * hasil di memori sekaligus.
   */
  async *streamQueueRows(organizationId: string, filter: {
    eventId: string
    from: string
    to: string
    queueTypeId?: string
    status?: string
  }) {
    const event = await prisma.event.findFirst({
      where: { id: filter.eventId, organizationId, deletedAt: null },
      select: { id: true },
    })
    if (!event) throw errors.notFound('Event tidak ditemukan')

    const where = {
      eventId: filter.eventId,
      serviceDate: { gte: parseServiceDate(filter.from), lte: parseServiceDate(filter.to) },
      deletedAt: null,
      ...(filter.queueTypeId ? { queueTypeId: filter.queueTypeId } : {}),
      ...(filter.status ? { status: filter.status as never } : {}),
    }

    let cursor: string | undefined
    const take = 500

    while (true) {
      const rows = await prisma.queue.findMany({
        where,
        take,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        orderBy: { id: 'asc' },
        include: {
          queueType: { select: { code: true, name: true } },
          counter: { select: { name: true } },
          operator: { select: { name: true } },
          visitor: { select: { fullName: true, phone: true, email: true, identityNumber: true } },
          testimonial: { select: { rating: true, comment: true } },
        },
      })

      if (!rows.length) break

      for (const row of rows) {
        yield {
          'Tanggal Layanan': formatServiceDate(row.serviceDate),
          'Nomor': row.queueNumber,
          'Jenis Antrean': `${row.queueType.code} - ${row.queueType.name}`,
          'Status': row.status,
          'Nama Pengunjung': row.visitor?.fullName ?? '',
          'Nomor HP': row.visitor?.phone ?? '',
          'Email': row.visitor?.email ?? '',
          'Nomor Identitas': row.visitor?.identityNumber ?? '',
          'Loket': row.counter?.name ?? '',
          'Operator': row.operator?.name ?? '',
          'Waktu Ambil': row.createdAt.toISOString(),
          'Waktu Dipanggil': row.calledAt?.toISOString() ?? '',
          'Waktu Selesai': row.finishedAt?.toISOString() ?? '',
          'Menunggu (detik)': row.waitingSeconds ?? '',
          'Layanan (detik)': row.serviceSeconds ?? '',
          'Panggil Ulang': row.recallCount,
          'Rating': row.testimonial?.rating ?? '',
          'Komentar': row.testimonial?.comment ?? '',
        }
      }

      if (rows.length < take) break
      cursor = rows[rows.length - 1]!.id
    }
  },

  async *streamVisitorRows(organizationId: string, filter: { eventId: string, from: string, to: string }) {
    const event = await prisma.event.findFirst({
      where: { id: filter.eventId, organizationId, deletedAt: null },
      select: { id: true },
    })
    if (!event) throw errors.notFound('Event tidak ditemukan')

    let cursor: string | undefined
    const take = 500

    while (true) {
      const rows = await prisma.visitor.findMany({
        where: {
          eventId: filter.eventId,
          queues: {
            some: {
              serviceDate: { gte: parseServiceDate(filter.from), lte: parseServiceDate(filter.to) },
              deletedAt: null,
            },
          },
        },
        take,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        orderBy: { id: 'asc' },
        include: { queues: { select: { queueNumber: true, status: true }, take: 5 } },
      })

      if (!rows.length) break

      for (const row of rows) {
        yield {
          'Nama': row.fullName ?? '',
          'Nomor HP': row.phone ?? '',
          'Email': row.email ?? '',
          'Nomor Identitas': row.identityNumber ?? '',
          'Nomor Antrean': row.queues.map(q => q.queueNumber).join(', '),
          'Status Terakhir': row.queues.at(-1)?.status ?? '',
          'Waktu Daftar': row.createdAt.toISOString(),
          'Data Formulir': JSON.stringify(row.data ?? {}),
        }
      }

      if (rows.length < take) break
      cursor = rows[rows.length - 1]!.id
    }
  },

  /** Testimoni satu event pada rentang tanggal layanan (§23, §38). */
  async *streamTestimonialRows(organizationId: string, filter: { eventId: string, from: string, to: string }) {
    const event = await prisma.event.findFirst({
      where: { id: filter.eventId, organizationId, deletedAt: null },
      select: { id: true },
    })
    if (!event) throw errors.notFound('Event tidak ditemukan')

    let cursor: string | undefined
    const take = 500

    while (true) {
      const rows = await prisma.testimonial.findMany({
        where: {
          eventId: filter.eventId,
          queue: {
            serviceDate: { gte: parseServiceDate(filter.from), lte: parseServiceDate(filter.to) },
            deletedAt: null,
          },
        },
        take,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        orderBy: { id: 'asc' },
        select: {
          id: true,
          rating: true,
          comment: true,
          isApproved: true,
          createdAt: true,
          visitor: { select: { fullName: true } },
          queue: {
            select: {
              queueNumber: true,
              serviceDate: true,
              queueType: { select: { name: true } },
              operator: { select: { name: true } },
              counter: { select: { name: true } },
            },
          },
        },
      })

      if (!rows.length) break

      for (const row of rows) {
        yield {
          'Tanggal Layanan': formatServiceDate(row.queue.serviceDate),
          'Nomor Antrean': row.queue.queueNumber,
          'Layanan': row.queue.queueType.name,
          'Loket': row.queue.counter?.name ?? '',
          'Operator': row.queue.operator?.name ?? '',
          'Pengunjung': row.visitor?.fullName ?? '',
          'Rating': row.rating,
          'Komentar': row.comment ?? '',
          'Status Moderasi': row.isApproved ? 'Disetujui' : 'Menunggu',
          'Waktu Kirim': row.createdAt.toISOString(),
        }
      }

      if (rows.length < take) break
      cursor = rows[rows.length - 1]!.id
    }
  },

  async *streamOperatorRows(organizationId: string, filter: { eventId: string, from: string, to: string }) {
    const data = await analyticsService.overview(organizationId, {
      eventId: filter.eventId,
      from: filter.from,
      to: filter.to,
    })

    for (const operator of data.operators) {
      yield {
        'Operator': operator.name,
        'Dilayani': operator.served,
        'Dilewati': operator.skipped,
        'Panggil Ulang': operator.recalls,
        'Rata-rata Layanan (detik)': operator.avgServiceSeconds ? Math.round(operator.avgServiceSeconds) : '',
      }
    }
  },
}
