import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { prisma } from '../../server/utils/prisma'
import { queueService } from '../../server/services/queue.service'
import { makeCounter, makeEvent, makeOrganization, makeQueueType, makeUser, resetDatabase, seatOperator } from '../helpers/factory'

/**
 * §57.3 — nomor antrean tidak boleh duplikat
 * §59.27 / §59.28 — tidak ada nomor ganda, tidak ada double-calling
 */
describe('konkurensi antrean', () => {
  let organizationId: string
  let eventId: string
  let queueTypeId: string

  beforeAll(async () => {
    await resetDatabase()
    const org = await makeOrganization()
    const event = await makeEvent(org.id)
    const queueType = await makeQueueType(event.id, { code: 'A', prefix: 'A' })
    organizationId = org.id
    eventId = event.id
    queueTypeId = queueType.id
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  it('20 pengambilan paralel menghasilkan 20 nomor berurutan tanpa duplikat', async () => {
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        queueService.create({
          eventId,
          queueTypeId,
          source: 'PUBLIC',
          visitor: { fullName: `Pengunjung ${i + 1}` },
        }),
      ),
    )

    const numbers = results.map(r => r.queueNumber).sort()
    const unique = new Set(numbers)

    expect(results).toHaveLength(20)
    expect(unique.size).toBe(20)
    expect(numbers[0]).toBe('A001')
    expect(numbers.at(-1)).toBe('A020')

    const sequences = results.map(r => r.sequenceNumber).sort((a, b) => a - b)
    expect(sequences).toEqual(Array.from({ length: 20 }, (_, i) => i + 1))

    // counter database harus sinkron dengan jumlah antrean yang terbit
    const counter = await prisma.queueCounter.findFirst({ where: { eventId, queueTypeId } })
    expect(counter?.currentNumber).toBe(20)

    void organizationId
  })

  it('constraint unik menolak nomor urut ganda pada service date yang sama', async () => {
    const existing = await prisma.queue.findFirst({ where: { eventId, queueTypeId }, orderBy: { sequenceNumber: 'asc' } })
    expect(existing).toBeTruthy()

    await expect(
      prisma.queue.create({
        data: {
          id: 'DUPLICATETEST0000000000001',
          organizationId: existing!.organizationId,
          eventId,
          queueTypeId,
          serviceDate: existing!.serviceDate,
          sequenceNumber: existing!.sequenceNumber,
          queueNumber: 'A001-DUP',
          publicToken: 'duplicate-test-token-0001',
        },
      }),
    ).rejects.toThrow()
  })

  it('dua operator menekan NEXT bersamaan tidak pernah mendapat antrean yang sama', async () => {
    const { operatorQueueService } = await import('../../server/services/operator.service')

    const org = await prisma.organization.findFirstOrThrow()
    const counter1 = await makeCounter(eventId, 'LX1')
    const counter2 = await makeCounter(eventId, 'LX2')
    const op1 = await makeUser(org.id, 'Operator A')
    const op2 = await makeUser(org.id, 'Operator B')
    // Dua loket berbeda, keduanya melayani layanan yang sama — inilah kondisi
    // yang membuat dua operator bisa menekan NEXT bersamaan.
    await seatOperator(op1.id, counter1.id, [queueTypeId])
    await seatOperator(op2.id, counter2.id, [queueTypeId])

    const waitingBefore = await prisma.queue.count({ where: { queueTypeId, status: 'WAITING' } })
    expect(waitingBefore).toBeGreaterThanOrEqual(10)

    // 10 panggilan paralel dari dua operator
    const calls = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        operatorQueueService
          .callNext({
            userId: i % 2 === 0 ? op1.id : op2.id,
            queueTypeId,
            counterId: i % 2 === 0 ? counter1.id : counter2.id,
          })
          .catch(() => null),
      ),
    )

    const called = calls.filter((c): c is NonNullable<typeof c> => !!c)
    const ids = called.map(c => c.id)

    expect(new Set(ids).size).toBe(ids.length)
    expect(called.length).toBeGreaterThan(0)

    // setiap antrean yang dipanggil hanya boleh dimiliki satu operator
    const rows = await prisma.queue.findMany({ where: { id: { in: ids } }, select: { id: true, status: true, operatorId: true } })
    for (const row of rows) {
      expect(['CALLED', 'SERVING']).toContain(row.status)
      expect(row.operatorId).toBeTruthy()
    }
  })
})
