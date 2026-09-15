import { ulid } from 'ulid'
import { prisma } from '../../server/utils/prisma'

/** Kosongkan seluruh tabel transaksional antar test. */
export async function resetDatabase() {
  const tables = [
    'queue_events',
    'testimonials',
    'queues',
    'queue_counters',
    'visitor_field_values',
    'visitors',
    'operator_assignments',
    'counter_services',
    'form_fields',
    'form_definitions',
    'qr_codes',
    'public_pages',
    'counters',
    'queue_types',
    'event_schedules',
    'events',
    'audit_logs',
    'user_roles',
    'role_permissions',
    'roles',
    'permissions',
    'accounts',
    'sessions',
    'users',
    'organizations',
  ]
  // Satu transaksi interaktif = satu koneksi, sehingga SET FOREIGN_KEY_CHECKS
  // benar-benar berlaku untuk seluruh DELETE di bawahnya.
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 0')
    for (const table of tables) {
      await tx.$executeRawUnsafe(`DELETE FROM \`${table}\``)
    }
    await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 1')
  }, { timeout: 60_000 })
}

export async function makeOrganization(timezone = 'Asia/Jakarta') {
  return prisma.organization.create({
    data: { id: ulid(), name: 'Test Org', slug: `test-org-${ulid().slice(-6).toLowerCase()}`, timezone },
  })
}

export async function makeEvent(
  organizationId: string,
  overrides: Partial<{ name: string, timezone: string, status: 'OPEN' | 'CLOSED' | 'PAUSED' | 'DRAFT' }> = {},
) {
  const event = await prisma.event.create({
    data: {
      id: ulid(),
      organizationId,
      name: overrides.name ?? 'Test Event',
      slug: `test-event-${ulid().slice(-6).toLowerCase()}`,
      status: overrides.status ?? 'OPEN',
      timezone: overrides.timezone ?? 'Asia/Jakarta',
    },
  })

  // buka 00:00–23:59 setiap hari supaya test tidak bergantung jam berjalan
  await prisma.eventSchedule.createMany({
    data: Array.from({ length: 7 }, (_, day) => ({
      id: ulid(),
      eventId: event.id,
      dayOfWeek: day,
      openTime: '00:00',
      closeTime: '23:59',
      isClosed: false,
    })),
  })

  return event
}

export async function makeQueueType(
  eventId: string,
  overrides: Partial<{ code: string, prefix: string, startingNumber: number, padding: number, maxWaiting: number | null, numberFormat: string }> = {},
) {
  return prisma.queueType.create({
    data: {
      id: ulid(),
      eventId,
      code: overrides.code ?? 'A',
      name: 'Layanan Uji',
      prefix: overrides.prefix ?? overrides.code ?? 'A',
      startingNumber: overrides.startingNumber ?? 1,
      numberFormat: overrides.numberFormat ?? '{prefix}{seq}',
      padding: overrides.padding ?? 3,
      maxWaiting: overrides.maxWaiting ?? null,
      estServiceSeconds: 300,
    },
  })
}

export async function makeCounter(eventId: string, code = 'L1') {
  return prisma.counter.create({
    data: { id: ulid(), eventId, code, name: `Loket ${code}` },
  })
}

export async function makeUser(organizationId: string, name = 'Operator Uji') {
  return prisma.user.create({
    data: {
      id: ulid(),
      organizationId,
      name,
      email: `${ulid().toLowerCase()}@test.local`,
      emailVerified: true,
    },
  })
}

/** Tetapkan layanan yang dilayani sebuah loket (§12). */
export async function serveQueueTypes(counterId: string, queueTypeIds: string[]) {
  await prisma.counterService.deleteMany({ where: { counterId } })
  await prisma.counterService.createMany({
    data: queueTypeIds.map((queueTypeId, index) => ({
      id: ulid(),
      counterId,
      queueTypeId,
      displayOrder: index,
    })),
  })
}

/**
 * Dudukkan operator di sebuah loket, sekaligus memastikan loket itu melayani
 * jenis antrean yang disebut.
 *
 * Cakupan operator kini diturunkan dari loket (§28), jadi helper ini menyiapkan
 * keduanya — sebab keduanya memang harus ada agar operator bisa bekerja.
 */
export async function seatOperator(userId: string, counterId: string, queueTypeIds: string[]) {
  await serveQueueTypes(counterId, queueTypeIds)
  return prisma.operatorAssignment.upsert({
    where: { userId },
    update: { counterId },
    create: { id: ulid(), userId, counterId },
  })
}
