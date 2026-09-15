import { z } from 'zod'
import { defineApiHandler } from '../../../utils/handler'
import { ok } from '../../../utils/response'
import { requireOrganization, requirePermission } from '../../../utils/context'
import { prisma } from '../../../utils/prisma'
import { parseServiceDate, resolveServiceDate } from '../../../utils/datetime'
import { dateSchema, idSchema } from '../../../../shared/schemas/common'
import { PERMISSIONS } from '../../../../shared/constants/permissions'

const querySchema = z.object({
  eventId: idSchema,
  date: dateSchema.optional(),
  status: z.string().optional(),
  queueTypeId: idSchema.optional(),
  search: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(200).default(50),
})

/** Monitor antrean lintas layanan untuk admin (live queue & riwayat). */
export default defineApiHandler(async (event) => {
  const ctx = await requirePermission(event, PERMISSIONS.QUEUE_VIEW, PERMISSIONS.QUEUE_VIEW_ALL)
  const organizationId = requireOrganization(ctx)
  const q = querySchema.parse(getQuery(event))

  const target = await prisma.event.findFirst({
    where: { id: q.eventId, organizationId, deletedAt: null },
    select: { id: true, timezone: true },
  })
  if (!target) return ok({ items: [], total: 0, page: q.page, perPage: q.perPage, totalPages: 0 })

  const serviceDate = q.date ? parseServiceDate(q.date) : resolveServiceDate(target.timezone)

  const where = {
    eventId: q.eventId,
    serviceDate,
    deletedAt: null,
    ...(q.queueTypeId ? { queueTypeId: q.queueTypeId } : {}),
    ...(q.status ? { status: q.status as never } : {}),
    ...(q.search
      ? {
          OR: [
            { queueNumber: { contains: q.search } },
            { visitor: { fullName: { contains: q.search } } },
            { visitor: { phone: { contains: q.search } } },
          ],
        }
      : {}),
  }

  const [items, total] = await Promise.all([
    prisma.queue.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }],
      skip: (q.page - 1) * q.perPage,
      take: q.perPage,
      include: {
        queueType: { select: { id: true, code: true, name: true, color: true } },
        counter: { select: { name: true } },
        operator: { select: { name: true } },
        visitor: { select: { fullName: true, phone: true } },
      },
    }),
    prisma.queue.count({ where }),
  ])

  return ok({
    items,
    total,
    page: q.page,
    perPage: q.perPage,
    totalPages: Math.ceil(total / q.perPage),
  })
})
