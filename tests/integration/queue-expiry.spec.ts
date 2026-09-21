import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { prisma } from '../../server/utils/prisma'
import { queueService } from '../../server/services/queue.service'
import { operatorQueueService } from '../../server/services/operator.service'
import { makeCounter, makeEvent, makeOrganization, makeQueueType, makeUser, resetDatabase, seatOperator, serveQueueTypes } from '../helpers/factory'

/**
 * §58 — nomor yang sudah dilewati sekian nomor menjadi hangus.
 *
 * Batasnya diambil dari pengaturan (`queue.expireAfterSkips`) dan boleh ditimpa
 * per event; di sini dipakai penimpaan per event supaya jalur itu ikut teruji.
 */
describe('nomor hangus karena terlewat', () => {
  let eventId: string
  let operatorId: string
  let counterId: string

async function siapkanLayanan(kode: string, batas: number) {
    const type = await makeQueueType(eventId, { code: kode, prefix: kode })
    await serveQueueTypes(counterId, [type.id])
    await prisma.event.update({ where: { id: eventId }, data: { settings: { expireAfterSkips: batas } } })
    return type.id
  }

  const statusDari = async (id: string) =>
    (await prisma.queue.findFirstOrThrow({ where: { id }, select: { status: true } })).status

  beforeAll(async () => {
    await resetDatabase()
    const org = await makeOrganization()
    const event = await makeEvent(org.id)
    const counter = await makeCounter(event.id, 'L1')
    const operator = await makeUser(org.id, 'Operator')
    await seatOperator(operator.id, counter.id, [])

    eventId = event.id
    counterId = counter.id
    operatorId = operator.id
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  it('nomor yang dilewati tiga panggilan menjadi hangus, yang belum tiba gilirannya tidak', async () => {
    const typeId = await siapkanLayanan('A', 3)
    const antrean = []
    for (let i = 0; i < 5; i++) antrean.push(await queueService.create({ eventId, queueTypeId: typeId }))

    // A001 dipanggil lalu dilewati petugas, tiga nomor berikutnya dipanggil.
    await operatorQueueService.callNext({ userId: operatorId, queueTypeId: typeId })
    await operatorQueueService.skip({ userId: operatorId, queueId: antrean[0]!.id })
    for (let i = 0; i < 3; i++) await operatorQueueService.callNext({ userId: operatorId, queueTypeId: typeId })

    expect(await statusDari(antrean[0]!.id)).toBe('EXPIRED')
    // A005 belum tiba gilirannya — tidak ada nomor SESUDAHNYA yang dipanggil.
    expect(await statusDari(antrean[4]!.id)).toBe('WAITING')
  })

  it('batas 0 mematikan aturannya', async () => {
    const typeId = await siapkanLayanan('B', 0)
    const antrean = []
    for (let i = 0; i < 4; i++) antrean.push(await queueService.create({ eventId, queueTypeId: typeId }))

    await operatorQueueService.callNext({ userId: operatorId, queueTypeId: typeId })
    await operatorQueueService.skip({ userId: operatorId, queueId: antrean[0]!.id })
    for (let i = 0; i < 3; i++) await operatorQueueService.callNext({ userId: operatorId, queueTypeId: typeId })

    expect(await statusDari(antrean[0]!.id)).toBe('SKIPPED')
  })

  it('panggilan prioritas tidak menghanguskan nomor biasa', async () => {
    const typeId = await siapkanLayanan('C', 3)
    const antrean = []
    for (let i = 0; i < 4; i++) antrean.push(await queueService.create({ eventId, queueTypeId: typeId }))

    // Tiga nomor di belakang dipanggil sebagai PRIORITAS — giliran C001 tertunda,
    // bukan terlewat, jadi nomornya harus tetap hidup.
    for (const q of antrean.slice(1)) {
      await operatorQueueService.callSpecific({ userId: operatorId, queueId: q.id, counterId, priority: true })
    }

    expect(await statusDari(antrean[0]!.id)).toBe('WAITING')
  })
})
