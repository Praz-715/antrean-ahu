import { defineApiHandler } from '../utils/handler'
import { ok } from '../utils/response'
import { getAuthContext } from '../utils/context'
import { prisma } from '../utils/prisma'

/** Profil + permission + assignment user yang sedang login. Dipakai klien untuk gating UI. */
export default defineApiHandler(async (event) => {
  const ctx = await getAuthContext(event)
  if (!ctx) return ok(null, 'Belum login')

  const [organization, placement] = await Promise.all([
    ctx.organizationId
      ? prisma.organization.findUnique({
          where: { id: ctx.organizationId },
          select: { id: true, name: true, slug: true, logoUrl: true, timezone: true },
        })
      : null,
    /**
     * Penempatan operator: satu loket, dan layanan diturunkan dari loket itu (§28).
     * Bentuk keluarannya dipertahankan (satu baris per layanan) supaya klien tidak
     * perlu berubah.
     */
    prisma.operatorAssignment.findUnique({
      where: { userId: ctx.userId },
      select: {
        id: true,
        counter: {
          select: {
            id: true,
            code: true,
            name: true,
            event: { select: { id: true, name: true, status: true, timezone: true } },
            services: {
              orderBy: { displayOrder: 'asc' },
              select: {
                displayOrder: true,
                queueType: { select: { id: true, code: true, name: true, color: true, icon: true, isActive: true, deletedAt: true } },
              },
            },
          },
        },
      },
    }),
  ])

  // Satu baris per layanan yang dilayani loketnya — bentuk yang sudah dipakai klien.
  const assignments = (placement?.counter.services ?? [])
    .filter(row => row.queueType.isActive && !row.queueType.deletedAt)
    .map(row => ({
      id: `${placement!.id}:${row.queueType.id}`,
      isDefault: row.displayOrder === 0,
      queueType: {
        id: row.queueType.id,
        code: row.queueType.code,
        name: row.queueType.name,
        color: row.queueType.color,
        icon: row.queueType.icon,
      },
      counter: { id: placement!.counter.id, code: placement!.counter.code, name: placement!.counter.name },
      event: placement!.counter.event,
    }))

  return ok({
    user: { id: ctx.userId, name: ctx.name, email: ctx.email },
    organization,
    roles: ctx.roleKeys,
    isSuperadmin: ctx.isSuperadmin,
    permissions: [...ctx.permissions],
    assignments,
  })
})
