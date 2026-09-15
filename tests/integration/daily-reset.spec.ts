import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { prisma } from '../../server/utils/prisma'
import { queueService } from '../../server/services/queue.service'
import { formatServiceDate, parseServiceDate, resolveServiceDate, serviceDateString } from '../../server/utils/datetime'
import { makeEvent, makeOrganization, makeQueueType, resetDatabase } from '../helpers/factory'

/**
 * §8 — nomor direset tiap service date, histori hari sebelumnya tetap utuh
 * §50 — service date memakai timezone EVENT, bukan timezone server
 */
describe('reset harian & service date', () => {
  beforeAll(async () => {
    await resetDatabase()
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  it('nomor kembali ke 001 pada tanggal layanan berikutnya, histori kemarin tetap ada', async () => {
    const org = await makeOrganization()
    const event = await makeEvent(org.id)
    const queueType = await makeQueueType(event.id, { code: 'A', prefix: 'A' })

    // hari ini: 3 antrean
    const today = []
    for (let i = 0; i < 3; i++) {
      today.push(await queueService.create({ eventId: event.id, queueTypeId: queueType.id }))
    }
    expect(today.map(q => q.queueNumber)).toEqual(['A001', 'A002', 'A003'])

    // Simulasikan hari berikutnya dengan menggeser service_date data hari ini ke kemarin,
    // termasuk baris counter-nya — persis seperti keadaan pada pergantian hari.
    const todayDate = resolveServiceDate(event.timezone)
    const yesterday = new Date(todayDate.getTime() - 86_400_000)

    await prisma.queue.updateMany({ where: { eventId: event.id }, data: { serviceDate: yesterday } })
    await prisma.queueCounter.updateMany({ where: { eventId: event.id }, data: { serviceDate: yesterday } })

    // hari baru
    const fresh = await queueService.create({ eventId: event.id, queueTypeId: queueType.id })
    expect(fresh.queueNumber).toBe('A001')
    expect(fresh.sequenceNumber).toBe(1)

    // histori kemarin tidak hilang dan tidak tertimpa
    const historical = await prisma.queue.findMany({
      where: { eventId: event.id, serviceDate: yesterday },
      orderBy: { sequenceNumber: 'asc' },
    })
    expect(historical).toHaveLength(3)
    expect(historical.map(h => h.queueNumber)).toEqual(['A001', 'A002', 'A003'])

    // dua baris counter terpisah per tanggal
    const counters = await prisma.queueCounter.findMany({ where: { eventId: event.id } })
    expect(counters).toHaveLength(2)

    // nomor sama boleh ada di dua tanggal berbeda
    const allA001 = await prisma.queue.findMany({ where: { eventId: event.id, queueNumber: 'A001' } })
    expect(allA001).toHaveLength(2)
  })

  it('service date mengikuti timezone event, bukan timezone server', async () => {
    // 2026-09-05 17:30 UTC = 06 Sep 00:30 WIB, tapi masih 05 Sep di UTC
    const at = new Date('2026-09-05T17:30:00.000Z')

    expect(serviceDateString('Asia/Jakarta', at)).toBe('2026-09-06')
    expect(serviceDateString('UTC', at)).toBe('2026-09-05')
    expect(serviceDateString('Asia/Jayapura', at)).toBe('2026-09-06')

    // hasil resolveServiceDate selalu UTC-midnight agar cocok dengan kolom DATE
    const resolved = resolveServiceDate('Asia/Jakarta', at)
    expect(resolved.toISOString()).toBe('2026-09-06T00:00:00.000Z')
    expect(formatServiceDate(resolved)).toBe('2026-09-06')
    expect(parseServiceDate('2026-09-06').getTime()).toBe(resolved.getTime())
  })

  it('dua event dengan timezone berbeda punya deret nomor sendiri-sendiri', async () => {
    const org = await makeOrganization()
    const jakarta = await makeEvent(org.id, { timezone: 'Asia/Jakarta' })
    const jayapura = await makeEvent(org.id, { timezone: 'Asia/Jayapura' })
    const typeA = await makeQueueType(jakarta.id, { code: 'A', prefix: 'A' })
    const typeB = await makeQueueType(jayapura.id, { code: 'A', prefix: 'A' })

    const q1 = await queueService.create({ eventId: jakarta.id, queueTypeId: typeA.id })
    const q2 = await queueService.create({ eventId: jayapura.id, queueTypeId: typeB.id })

    expect(q1.queueNumber).toBe('A001')
    expect(q2.queueNumber).toBe('A001')
    expect(q1.id).not.toBe(q2.id)
  })

  it('format nomor kustom dihormati saat generate', async () => {
    const org = await makeOrganization()
    const event = await makeEvent(org.id)
    const queueType = await makeQueueType(event.id, {
      code: 'UM',
      prefix: 'UM',
      numberFormat: '{code}-{seq}',
      padding: 4,
      startingNumber: 10,
    })

    const first = await queueService.create({ eventId: event.id, queueTypeId: queueType.id })
    const second = await queueService.create({ eventId: event.id, queueTypeId: queueType.id })

    expect(first.queueNumber).toBe('UM-0010')
    expect(second.queueNumber).toBe('UM-0011')
  })
})
