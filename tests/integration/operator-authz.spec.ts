import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { prisma } from '../../server/utils/prisma'
import { queueService } from '../../server/services/queue.service'
import { assertTransition, operatorQueueService } from '../../server/services/operator.service'
import { makeCounter, makeEvent, makeOrganization, makeQueueType, makeUser, resetDatabase, seatOperator } from '../helpers/factory'

/** §12, §57.5, §57.7–§57.9 — operator hanya boleh menyentuh assignment-nya. */
describe('otorisasi operator & aturan transisi', () => {
  let eventId: string
  let typeAId: string
  let typeBId: string
  let operatorAId: string
  let operatorBId: string
  let counterAId: string

  beforeAll(async () => {
    await resetDatabase()
    const org = await makeOrganization()
    const event = await makeEvent(org.id)
    const typeA = await makeQueueType(event.id, { code: 'A', prefix: 'A' })
    const typeB = await makeQueueType(event.id, { code: 'B', prefix: 'B' })
    const counterA = await makeCounter(event.id, 'L1')
    const counterB = await makeCounter(event.id, 'L2')
    const opA = await makeUser(org.id, 'Operator A')
    const opB = await makeUser(org.id, 'Operator B')

    // Tiap operator duduk di loketnya sendiri, dan loket itu melayani satu layanan.
    await seatOperator(opA.id, counterA.id, [typeA.id])
    await seatOperator(opB.id, counterB.id, [typeB.id])

    eventId = event.id
    typeAId = typeA.id
    typeBId = typeB.id
    operatorAId = opA.id
    operatorBId = opB.id
    counterAId = counterA.id
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  it('operator tidak bisa memanggil antrean dari layanan yang bukan assignment-nya', async () => {
    await queueService.create({ eventId, queueTypeId: typeAId })

    await expect(
      operatorQueueService.callNext({ userId: operatorBId, queueTypeId: typeAId }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('operator tidak bisa membuka papan kerja layanan lain', async () => {
    await expect(operatorQueueService.board(operatorBId, typeAId)).rejects.toMatchObject({ code: 'FORBIDDEN' })
    await expect(operatorQueueService.board(operatorAId, typeAId)).resolves.toBeTruthy()
  })

  it('operator tidak bisa menyelesaikan antrean milik layanan lain', async () => {
    const queue = await queueService.create({ eventId, queueTypeId: typeAId })
    await expect(
      operatorQueueService.complete({ userId: operatorBId, queueId: queue.id }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('antrean COMPLETED tidak bisa dipanggil ulang lewat jalur operator biasa', async () => {
    const queue = await queueService.create({ eventId, queueTypeId: typeAId })
    await operatorQueueService.callSpecific({ userId: operatorAId, queueId: queue.id, counterId: counterAId })
    await operatorQueueService.complete({ userId: operatorAId, queueId: queue.id })

    await expect(
      operatorQueueService.callSpecific({ userId: operatorAId, queueId: queue.id }),
    ).rejects.toMatchObject({ code: 'QUEUE_INVALID_TRANSITION' })
  })

  it('antrean SKIPPED boleh dipanggil kembali', async () => {
    const queue = await queueService.create({ eventId, queueTypeId: typeAId })
    await operatorQueueService.callSpecific({ userId: operatorAId, queueId: queue.id, counterId: counterAId })
    const skipped = await operatorQueueService.skip({ userId: operatorAId, queueId: queue.id })
    expect(skipped.status).toBe('SKIPPED')

    const recalled = await operatorQueueService.callSpecific({ userId: operatorAId, queueId: queue.id })
    expect(recalled.status).toBe('CALLED')
  })

  it('antrean CANCELLED tidak dapat dipanggil', () => {
    expect(() => assertTransition('CANCELLED', 'CALLED')).toThrow()
    expect(() => assertTransition('COMPLETED', 'CALLED')).toThrow()
    expect(() => assertTransition('WAITING', 'CALLED')).not.toThrow()
    expect(() => assertTransition('SKIPPED', 'CALLED')).not.toThrow()
    expect(() => assertTransition('CALLED', 'COMPLETED')).not.toThrow()
  })

  it('menekan NEXT menutup antrean yang sedang dilayani operator tersebut', async () => {
    await prisma.queue.deleteMany({ where: { queueTypeId: typeAId } })

    const first = await queueService.create({ eventId, queueTypeId: typeAId })
    const second = await queueService.create({ eventId, queueTypeId: typeAId })

    const called = await operatorQueueService.callNext({ userId: operatorAId, queueTypeId: typeAId })
    expect(called.id).toBe(first.id)

    const next = await operatorQueueService.callNext({ userId: operatorAId, queueTypeId: typeAId })
    expect(next.id).toBe(second.id)

    const previous = await prisma.queue.findUniqueOrThrow({ where: { id: first.id } })
    expect(previous.status).toBe('COMPLETED')
    expect(previous.serviceSeconds).not.toBeNull()
  })

  it('NEXT pada antrean kosong memberi error yang jelas', async () => {
    await prisma.queue.deleteMany({ where: { queueTypeId: typeBId } })
    await expect(
      operatorQueueService.callNext({ userId: operatorBId, queueTypeId: typeBId }),
    ).rejects.toMatchObject({ code: 'QUEUE_EMPTY' })
  })

  it('setiap perubahan status tercatat di queue_events', async () => {
    await prisma.queue.deleteMany({ where: { queueTypeId: typeAId } })
    const queue = await queueService.create({ eventId, queueTypeId: typeAId })

    await operatorQueueService.callSpecific({ userId: operatorAId, queueId: queue.id, counterId: counterAId })
    await operatorQueueService.recall({ userId: operatorAId, queueId: queue.id })
    await operatorQueueService.startServing({ userId: operatorAId, queueId: queue.id })
    await operatorQueueService.complete({ userId: operatorAId, queueId: queue.id })

    const events = await prisma.queueEvent.findMany({
      where: { queueId: queue.id },
      orderBy: { createdAt: 'asc' },
      select: { eventType: true },
    })

    expect(events.map(e => e.eventType)).toEqual(['CREATED', 'CALLED', 'RECALLED', 'SERVING', 'COMPLETED'])
  })
})
