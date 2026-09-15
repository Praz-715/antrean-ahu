import { prisma } from '../utils/prisma'
import { errors } from '../utils/response'
import { ERROR_CODES } from '../../shared/constants/errors'
import { newId } from '../utils/id'
import { parseServiceDate } from '../utils/datetime'
import { settingService } from './setting.service'
import { SETTING_KEYS } from '../../shared/constants/settings'

export interface TestimonialFilter {
  eventId?: string
  rating?: number
  status?: 'all' | 'approved' | 'pending'
  from?: string
  to?: string
  search?: string
  page?: number
  limit?: number
}

/** Status antrean yang boleh dinilai: penilaian hanya masuk akal setelah dilayani (§23). */
const RATEABLE_STATUSES = ['COMPLETED']

/**
 * Rating & testimoni pengunjung (§23).
 *
 * Pengunjung tidak login, jadi haknya untuk menilai dibuktikan oleh `public_token`
 * antreannya sendiri — token yang sama yang dipakai halaman pelacakan. Satu antrean
 * hanya boleh dinilai satu kali; batas itu ditegakkan unique index di database,
 * bukan sekadar pemeriksaan di sini, supaya dua kiriman bersamaan tidak lolos.
 */
export const testimonialService = {
  async submit(publicToken: string, input: { rating: number, comment?: string | null }) {
    const queue = await prisma.queue.findFirst({
      where: { publicToken, deletedAt: null },
      select: {
        id: true,
        status: true,
        visitorId: true,
        eventId: true,
        queueNumber: true,
        event: { select: { organizationId: true, settings: true } },
        testimonial: { select: { id: true } },
      },
    })
    if (!queue) throw errors.notFound('Antrean tidak ditemukan')

    const settings = await settingService.forEvent(queue.event)
    if (!settings[SETTING_KEYS.FEEDBACK_RATING_ENABLED]) {
      throw errors.badRequest(ERROR_CODES.RATING_DISABLED, 'Penilaian sedang dinonaktifkan')
    }

    if (!RATEABLE_STATUSES.includes(queue.status)) {
      throw errors.conflict(
        ERROR_CODES.QUEUE_INVALID_TRANSITION,
        'Penilaian baru bisa dikirim setelah layanan selesai',
      )
    }

    if (queue.testimonial) {
      throw errors.conflict(ERROR_CODES.CONFLICT, 'Antrean ini sudah pernah dinilai. Terima kasih!')
    }

    const autoApprove = Boolean(settings[SETTING_KEYS.FEEDBACK_AUTO_APPROVE])

    try {
      const testimonial = await prisma.testimonial.create({
        data: {
          id: newId(),
          queueId: queue.id,
          visitorId: queue.visitorId,
          eventId: queue.eventId,
          rating: input.rating,
          comment: input.comment?.trim() || null,
          isApproved: autoApprove,
          approvedAt: autoApprove ? new Date() : null,
        },
        select: { id: true, rating: true, comment: true, isApproved: true, createdAt: true },
      })

      return { testimonial, organizationId: queue.event.organizationId, queueNumber: queue.queueNumber }
    }
    catch (error) {
      // Unique index pada queue_id — dua kiriman berbarengan, yang kedua kalah balapan.
      if ((error as { code?: string }).code === 'P2002') {
        throw errors.conflict(ERROR_CODES.CONFLICT, 'Antrean ini sudah pernah dinilai. Terima kasih!')
      }
      throw error
    }
  },

  /** Daftar testimoni untuk moderasi admin. */
  async list(organizationId: string, filter: TestimonialFilter) {
    const page = Math.max(1, filter.page ?? 1)
    const limit = Math.min(100, Math.max(1, filter.limit ?? 25))

    const where = buildWhere(organizationId, filter)

    const [total, items] = await Promise.all([
      prisma.testimonial.count({ where }),
      prisma.testimonial.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          rating: true,
          comment: true,
          isApproved: true,
          approvedAt: true,
          createdAt: true,
          approvedBy: { select: { id: true, name: true } },
          queue: {
            select: {
              queueNumber: true,
              serviceDate: true,
              queueType: { select: { id: true, name: true, color: true } },
              operator: { select: { name: true } },
              counter: { select: { name: true } },
            },
          },
          visitor: { select: { fullName: true } },
        },
      }),
    ])

    return {
      items: items.map(item => ({
        ...item,
        queue: {
          ...item.queue,
          serviceDate: item.queue.serviceDate.toISOString().slice(0, 10),
        },
      })),
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    }
  },

  /**
   * Rekap kepuasan.
   *
   * Sebaran per bintang diambil lewat satu `groupBy`, bukan lima query terpisah:
   * ringkasan ini ikut terbaca setiap kali halaman moderasi dibuka.
   */
  async summary(organizationId: string, filter: TestimonialFilter) {
    const where = buildWhere(organizationId, { ...filter, status: 'all' })

    const [aggregate, distribution, pending] = await Promise.all([
      prisma.testimonial.aggregate({ where, _count: { _all: true }, _avg: { rating: true } }),
      prisma.testimonial.groupBy({ where, by: ['rating'], _count: { _all: true } }),
      prisma.testimonial.count({ where: { ...where, isApproved: false } }),
    ])

    const byRating: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
    for (const row of distribution) byRating[row.rating] = row._count._all

    const total = aggregate._count._all
    const positive = byRating[4]! + byRating[5]!

    return {
      total,
      pending,
      average: aggregate._avg.rating ? Number(aggregate._avg.rating.toFixed(2)) : 0,
      byRating,
      satisfactionRate: total ? Math.round((positive / total) * 100) : 0,
    }
  },

  async getById(organizationId: string, id: string) {
    const testimonial = await prisma.testimonial.findFirst({
      where: { id, event: { organizationId, deletedAt: null } },
    })
    if (!testimonial) throw errors.notFound('Testimoni tidak ditemukan')
    return testimonial
  },

  /** Setujui atau sembunyikan kembali satu testimoni. */
  async moderate(organizationId: string, id: string, isApproved: boolean, userId: string) {
    await this.getById(organizationId, id)
    return prisma.testimonial.update({
      where: { id },
      data: {
        isApproved,
        approvedById: isApproved ? userId : null,
        approvedAt: isApproved ? new Date() : null,
      },
    })
  },

  async remove(organizationId: string, id: string) {
    const testimonial = await this.getById(organizationId, id)
    await prisma.testimonial.delete({ where: { id } })
    return testimonial
  },
}

function buildWhere(organizationId: string, filter: TestimonialFilter) {
  const serviceDate
    = filter.from || filter.to
      ? {
          ...(filter.from ? { gte: parseServiceDate(filter.from) } : {}),
          ...(filter.to ? { lte: parseServiceDate(filter.to) } : {}),
        }
      : undefined

  return {
    event: { organizationId, deletedAt: null },
    ...(filter.eventId ? { eventId: filter.eventId } : {}),
    ...(filter.rating ? { rating: filter.rating } : {}),
    ...(filter.status === 'approved' ? { isApproved: true } : {}),
    ...(filter.status === 'pending' ? { isApproved: false } : {}),
    ...(filter.search ? { comment: { contains: filter.search } } : {}),
    ...(serviceDate ? { queue: { serviceDate } } : {}),
  }
}
