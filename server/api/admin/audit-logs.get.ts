import { z } from 'zod'
import { defineApiHandler } from '../../utils/handler'
import { ok } from '../../utils/response'
import { requireOrganization, requirePermission } from '../../utils/context'
import { prisma } from '../../utils/prisma'
import { idSchema } from '../../../shared/schemas/common'
import { PERMISSIONS } from '../../../shared/constants/permissions'

const querySchema = z.object({
  action: z.string().max(60).optional(),
  entity: z.string().max(60).optional(),
  userId: idSchema.optional(),
  search: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(50),
})

/** Jejak aktivitas penting (§37), dengan penyaring dan daftar nilai untuk dropdown. */
export default defineApiHandler(async (event) => {
  const ctx = await requirePermission(event, PERMISSIONS.AUDIT_VIEW)
  const organizationId = requireOrganization(ctx)
  const q = querySchema.parse(getQuery(event))

  const where = {
    organizationId,
    ...(q.action ? { action: q.action } : {}),
    ...(q.entity ? { entity: q.entity } : {}),
    ...(q.userId ? { userId: q.userId } : {}),
    ...(q.search
      ? { OR: [{ entityId: { contains: q.search } }, { action: { contains: q.search } }] }
      : {}),
  }

  const [items, total, actions, entities, users] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (q.page - 1) * q.perPage,
      take: q.perPage,
      include: { user: { select: { id: true, name: true, email: true } } },
    }),
    prisma.auditLog.count({ where }),
    prisma.auditLog.groupBy({ by: ['action'], where: { organizationId }, _count: { _all: true } }),
    prisma.auditLog.groupBy({ by: ['entity'], where: { organizationId }, _count: { _all: true } }),
    prisma.user.findMany({
      where: { organizationId, deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
  ])

  return ok({
    items,
    total,
    page: q.page,
    perPage: q.perPage,
    totalPages: Math.ceil(total / q.perPage),
    filters: {
      actions: actions.map(a => ({ value: a.action, count: a._count._all })).sort((a, b) => b.count - a.count),
      entities: entities.map(e => ({ value: e.entity, count: e._count._all })).sort((a, b) => b.count - a.count),
      users,
    },
  })
})
