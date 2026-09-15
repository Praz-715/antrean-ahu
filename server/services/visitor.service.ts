import type { Prisma } from '../../generated/prisma/client'
import { prisma } from '../utils/prisma'
import { errors } from '../utils/response'
import { formatServiceDate, parseServiceDate } from '../utils/datetime'

export interface VisitorFilter {
  eventId: string
  search?: string
  queueTypeId?: string
  from?: string
  to?: string
  page?: number
  limit?: number
}

/**
 * Daftar pengunjung beserta jawaban formulirnya (§5, §16).
 *
 * Pencarian menyapu kolom inti (nama, HP, email, nomor identitas) sekaligus nomor
 * antrean, karena petugas di lapangan lebih sering memegang nomor antrean daripada
 * nama lengkap yang diketik pengunjung.
 */
export const visitorService = {
  async list(organizationId: string, filter: VisitorFilter) {
    const page = Math.max(1, filter.page ?? 1)
    const limit = Math.min(100, Math.max(1, filter.limit ?? 25))
    const where = buildWhere(organizationId, filter)

    const [total, rows] = await Promise.all([
      prisma.visitor.count({ where }),
      prisma.visitor.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          fullName: true,
          phone: true,
          email: true,
          identityNumber: true,
          createdAt: true,
          queues: {
            where: { deletedAt: null },
            orderBy: { createdAt: 'desc' },
            take: 3,
            select: {
              id: true,
              queueNumber: true,
              status: true,
              serviceDate: true,
              queueType: { select: { id: true, name: true, color: true } },
            },
          },
          _count: { select: { queues: true } },
        },
      }),
    ])

    return {
      items: rows.map(row => ({
        ...row,
        queues: row.queues.map(q => ({ ...q, serviceDate: formatServiceDate(q.serviceDate) })),
      })),
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    }
  },

  /**
   * Rincian satu pengunjung.
   *
   * Jawaban formulir dibaca dari `visitor_field_values` lalu diberi label memakai
   * definisi field yang masih ada. Field yang sudah dihapus tetap ditampilkan dengan
   * kuncinya — riwayat tidak boleh hilang hanya karena formulirnya berubah.
   */
  async getById(organizationId: string, id: string) {
    const visitor = await prisma.visitor.findFirst({
      where: { id, organizationId },
      select: {
        id: true,
        fullName: true,
        phone: true,
        email: true,
        identityNumber: true,
        data: true,
        ipAddress: true,
        createdAt: true,
        event: { select: { id: true, name: true } },
        fieldValues: {
          select: {
            id: true,
            fieldKey: true,
            valueText: true,
            valueNumber: true,
            valueDate: true,
            valueJson: true,
            formField: { select: { label: true, type: true, displayOrder: true } },
          },
        },
        queues: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            queueNumber: true,
            status: true,
            serviceDate: true,
            createdAt: true,
            calledAt: true,
            finishedAt: true,
            serviceSeconds: true,
            queueType: { select: { id: true, name: true, color: true } },
            counter: { select: { name: true } },
            operator: { select: { name: true } },
            testimonial: { select: { rating: true, comment: true, isApproved: true } },
          },
        },
      },
    })
    if (!visitor) throw errors.notFound('Pengunjung tidak ditemukan')

    const answers = visitor.fieldValues
      .map(value => ({
        key: value.fieldKey,
        label: value.formField?.label ?? value.fieldKey,
        type: value.formField?.type ?? 'TEXT',
        order: value.formField?.displayOrder ?? 999,
        value: value.valueJson ?? value.valueText ?? value.valueNumber?.toString() ?? null,
      }))
      .sort((a, b) => a.order - b.order)

    return {
      ...visitor,
      fieldValues: undefined,
      answers,
      queues: visitor.queues.map(q => ({ ...q, serviceDate: formatServiceDate(q.serviceDate) })),
    }
  },
}

function buildWhere(organizationId: string, filter: VisitorFilter): Prisma.VisitorWhereInput {
  const search = filter.search?.trim()

  const queueFilter: Prisma.QueueWhereInput = {
    deletedAt: null,
    ...(filter.queueTypeId ? { queueTypeId: filter.queueTypeId } : {}),
    ...(filter.from || filter.to
      ? {
          serviceDate: {
            ...(filter.from ? { gte: parseServiceDate(filter.from) } : {}),
            ...(filter.to ? { lte: parseServiceDate(filter.to) } : {}),
          },
        }
      : {}),
  }

  const needsQueueFilter = !!filter.queueTypeId || !!filter.from || !!filter.to

  return {
    organizationId,
    eventId: filter.eventId,
    ...(needsQueueFilter ? { queues: { some: queueFilter } } : {}),
    ...(search
      ? {
          OR: [
            { fullName: { contains: search } },
            { phone: { contains: search } },
            { email: { contains: search } },
            { identityNumber: { contains: search } },
            { queues: { some: { queueNumber: { contains: search }, deletedAt: null } } },
          ],
        }
      : {}),
  }
}
