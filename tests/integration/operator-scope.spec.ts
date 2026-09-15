import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { prisma } from '../../server/utils/prisma'
import { queueService } from '../../server/services/queue.service'
import { operatorQueueService } from '../../server/services/operator.service'
import { assignmentService } from '../../server/services/user.service'
import { counterService } from '../../server/services/queue-type.service'
import { makeCounter, makeEvent, makeOrganization, makeQueueType, makeUser, resetDatabase, serveQueueTypes } from '../helpers/factory'

/**
 * §28 — cakupan operator diturunkan dari LOKET, dan §57.6 — pengawas lintas layanan.
 *
 * Operator duduk di satu loket; loket itulah yang menentukan layanan apa saja yang
 * ia tangani. Karena satu operator hanya punya satu tempat duduk, aturan "satu
 * operator satu event" ikut terjaga oleh struktur, bukan oleh pemeriksaan tambahan.
 *
 * Wewenang lintas layanan diuji di berkas yang sama karena menyentuh penjaga yang
 * sama (`requireQueueAccess`), dan pernah bocor: bendera `crossAssignment` tidak
 * diteruskan ke `transition()` sehingga aksi selesai/lewati/tidak-hadir tetap ditolak.
 */
describe('cakupan operator: satu loket & wewenang lintas layanan', () => {
  let organizationId: string
  let eventAId: string
  let eventBId: string
  let typeAId: string
  let typeA2Id: string
  let typeBId: string
  let counterAId: string
  let counterA2Id: string
  let counterBId: string
  /** Loket tanpa layanan — dipakai menguji penolakan penempatan. */
  let counterKosongId: string
  let operatorId: string

  beforeAll(async () => {
    await resetDatabase()
    const org = await makeOrganization()
    const eventA = await makeEvent(org.id, { name: 'Event A' })
    const eventB = await makeEvent(org.id, { name: 'Event B' })
    const typeA = await makeQueueType(eventA.id, { code: 'A', prefix: 'A' })
    const typeA2 = await makeQueueType(eventA.id, { code: 'A2', prefix: 'C' })
    const typeB = await makeQueueType(eventB.id, { code: 'B', prefix: 'B' })

    const counterA = await makeCounter(eventA.id, 'LA')
    const counterA2 = await makeCounter(eventA.id, 'LA2')
    const counterB = await makeCounter(eventB.id, 'LB')
    const counterKosong = await makeCounter(eventA.id, 'LX')

    // LA melayani dua layanan sekaligus; LA2 dan LB masing-masing satu; LX kosong.
    await serveQueueTypes(counterA.id, [typeA.id, typeA2.id])
    await serveQueueTypes(counterA2.id, [typeA.id])
    await serveQueueTypes(counterB.id, [typeB.id])

    const operator = await makeUser(org.id, 'Operator Satu Loket')

    organizationId = org.id
    eventAId = eventA.id
    eventBId = eventB.id
    typeAId = typeA.id
    typeA2Id = typeA2.id
    typeBId = typeB.id
    counterAId = counterA.id
    counterA2Id = counterA2.id
    counterBId = counterB.id
    counterKosongId = counterKosong.id
    operatorId = operator.id
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  it('operator ditempatkan di loket dan mewarisi seluruh layanan loket itu', async () => {
    const placement = await assignmentService.place(organizationId, {
      userId: operatorId,
      counterId: counterAId,
    })

    expect(placement.event.id).toBe(eventAId)
    expect(placement.counter.id).toBe(counterAId)
    // Dua layanan sekaligus — tanpa satu pun baris penugasan tambahan.
    expect(placement.services.map(s => s.id).sort()).toEqual([typeAId, typeA2Id].sort())
    expect(await prisma.operatorAssignment.count({ where: { userId: operatorId } })).toBe(1)
  })

  it('loket tanpa layanan tidak bisa ditempati', async () => {
    await expect(assignmentService.place(organizationId, {
      userId: operatorId,
      counterId: counterKosongId,
    })).rejects.toThrow(/belum melayani jenis antrean/i)
  })

  it('layanan loket tidak boleh dikosongkan selama masih ada operator di sana', async () => {
    await expect(counterService.setServices(organizationId, counterAId, []))
      .rejects.toThrow(/pindahkan mereka/i)

    // Layanannya harus utuh — penolakan tidak boleh menghapus separuh baris.
    expect(await prisma.counterService.count({ where: { counterId: counterAId } })).toBe(2)
  })

  it('operator TIDAK bisa dipindahkan ke loket lain tanpa izin pindah', async () => {
    await expect(assignmentService.place(organizationId, {
      userId: operatorId,
      counterId: counterBId,
    })).rejects.toThrow(/sudah duduk di loket/i)

    // Tempat duduk lamanya harus utuh.
    const still = await prisma.operatorAssignment.findUnique({ where: { userId: operatorId } })
    expect(still?.counterId).toBe(counterAId)
  })

  it('pemindahan eksplisit mengganti tempat duduk, bukan menambahnya', async () => {
    const moved = await assignmentService.place(organizationId, {
      userId: operatorId,
      counterId: counterBId,
      moveFromOtherCounter: true,
    })

    expect(moved.event.id).toBe(eventBId)
    expect(moved.services.map(s => s.id)).toEqual([typeBId])
    expect(await prisma.operatorAssignment.count({ where: { userId: operatorId } })).toBe(1)
    expect(await prisma.operatorAssignment.count({ where: { counterId: counterAId } })).toBe(0)
  })

  it('pemindahan ditolak saat operator masih memegang antrean', async () => {
    const queue = await queueService.create({ eventId: eventBId, queueTypeId: typeBId, source: 'OPERATOR' })
    await operatorQueueService.callNext({ userId: operatorId, queueTypeId: typeBId, counterId: counterBId })

    await expect(assignmentService.place(organizationId, {
      userId: operatorId,
      counterId: counterAId,
      moveFromOtherCounter: true,
    })).rejects.toThrow(/masih melayani/i)

    // Setelah antreannya tuntas, pemindahan harus bisa dilakukan.
    await operatorQueueService.complete({ userId: operatorId, queueId: queue.id })
    const moved = await assignmentService.place(organizationId, {
      userId: operatorId,
      counterId: counterAId,
      moveFromOtherCounter: true,
    })
    expect(moved.event.id).toBe(eventAId)
  })

  it('operator hanya bisa memanggil antrean yang dilayani loketnya', async () => {
    // Pindahkan ke LA2 yang hanya melayani layanan A, lalu coba panggil layanan A2.
    await assignmentService.place(organizationId, {
      userId: operatorId,
      counterId: counterA2Id,
      moveFromOtherCounter: true,
    })

    await queueService.create({ eventId: eventAId, queueTypeId: typeA2Id, source: 'PUBLIC' })
    await expect(operatorQueueService.callNext({ userId: operatorId, queueTypeId: typeA2Id, counterId: counterA2Id }))
      .rejects.toThrow(/tidak melayani jenis antrean ini/i)

    // Kembalikan ke LA supaya kedua layanan kembali terjangkau.
    await assignmentService.place(organizationId, {
      userId: operatorId,
      counterId: counterAId,
      moveFromOtherCounter: true,
    })
    const board = await operatorQueueService.board(operatorId, typeA2Id)
    expect(board.waiting.length).toBe(1)
  })

  it('daftar kandidat menyebut loket dan event tempat operator sudah duduk', async () => {
    const candidates = await assignmentService.candidates(organizationId, eventBId)
    const row = candidates.find(c => c.id === operatorId)
    expect(row?.seatedAt?.counter.id).toBe(counterAId)
    expect(row?.seatedHere).toBe(false)
    expect(row?.assignedEvent?.id).toBe(eventAId)

    const forOwnEvent = await assignmentService.candidates(organizationId, eventAId)
    const own = forOwnEvent.find(c => c.id === operatorId)
    expect(own?.seatedHere).toBe(true)
    expect(own?.assignedEvent).toBeNull()
  })

  /**
   * Antrean pada layanan tanpa operator harus tetap bisa dibereskan pengawas —
   * kalau tidak, ia menggantung selamanya dan event-nya tidak bisa ditutup.
   */
  it('pengawas lintas layanan bisa membereskan antrean yang bukan penugasannya', async () => {
    const supervisor = await makeUser(organizationId, 'Pengawas')
    const orphanType = await makeQueueType(eventAId, { code: 'ORP', prefix: 'O' })

    const skipTarget = await queueService.create({ eventId: eventAId, queueTypeId: orphanType.id, source: 'PUBLIC' })
    await expect(operatorQueueService.skip({ userId: supervisor.id, queueId: skipTarget.id }))
      .rejects.toThrow(/belum ditempatkan/i)
    await operatorQueueService.skip({ userId: supervisor.id, queueId: skipTarget.id, crossAssignment: true })

    /**
     * WAITING tidak bisa langsung COMPLETED (§11), jadi jalurnya lewat SERVING —
     * dan keduanya harus menerima wewenang lintas layanan.
     */
    const completeTarget = await queueService.create({ eventId: eventAId, queueTypeId: orphanType.id, source: 'PUBLIC' })
    await operatorQueueService.startServing({ userId: supervisor.id, queueId: completeTarget.id, crossAssignment: true })
    await operatorQueueService.complete({ userId: supervisor.id, queueId: completeTarget.id, crossAssignment: true })

    const cancelTarget = await queueService.create({ eventId: eventAId, queueTypeId: orphanType.id, source: 'PUBLIC' })
    await operatorQueueService.cancel({ userId: supervisor.id, queueId: cancelTarget.id, crossAssignment: true })

    const statuses = await prisma.queue.findMany({
      where: { id: { in: [skipTarget.id, completeTarget.id, cancelTarget.id] } },
      select: { status: true },
      orderBy: { sequenceNumber: 'asc' },
    })
    expect(statuses.map(q => q.status)).toEqual(['SKIPPED', 'COMPLETED', 'CANCELLED'])

    /**
     * MEMANGGIL tetap butuh tempat duduk, bahkan bagi pengawas: panggilan harus
     * menyebut loket, dan loket hanya diketahui dari penempatan.
     */
    const callTarget = await queueService.create({ eventId: eventAId, queueTypeId: orphanType.id, source: 'PUBLIC' })
    await expect(operatorQueueService.callSpecific({ userId: supervisor.id, queueId: callTarget.id }))
      .rejects.toThrow(/belum ditempatkan/i)
  })
})
