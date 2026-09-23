import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { prisma } from '../../server/utils/prisma'
import { queueService } from '../../server/services/queue.service'
import { eventService } from '../../server/services/event.service'
import { queueTypeService } from '../../server/services/queue-type.service'
import { resolveServiceDate } from '../../server/utils/datetime'
import { makeEvent, makeOrganization, makeQueueType, resetDatabase } from '../helpers/factory'

/**
 * Penjagaan "masih ada antrean aktif" hanya boleh melihat TANGGAL LAYANAN BERJALAN.
 *
 * Nomor yang ditinggalkan menunggu pada hari sebelumnya tidak pernah berubah status
 * sendiri dan tidak lagi muncul di papan operator maupun layar — keduanya bekerja per
 * tanggal layanan. Tanpa batas tanggal, satu nomor yang terlupakan minggu lalu
 * mengunci event dan jenis antreannya selamanya tanpa ada tempat membereskannya.
 */
describe('penjaga antrean aktif dibatasi hari berjalan', () => {
  let organizationId: string

  /** Geser seluruh antrean event ke kemarin, seperti keadaan setelah pergantian hari. */
  async function jadikanKemarin(eventId: string, timezone: string) {
    const kemarin = new Date(resolveServiceDate(timezone).getTime() - 86_400_000)
    await prisma.queue.updateMany({ where: { eventId }, data: { serviceDate: kemarin } })
    await prisma.queueCounter.updateMany({ where: { eventId }, data: { serviceDate: kemarin } })
    return kemarin
  }

  beforeAll(async () => {
    await resetDatabase()
    const org = await makeOrganization()
    organizationId = org.id
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  it('event dengan nomor tertinggal dari hari sebelumnya tetap bisa dihapus', async () => {
    const event = await makeEvent(organizationId)
    const type = await makeQueueType(event.id, { code: 'A', prefix: 'A' })
    const antrean = await queueService.create({ eventId: event.id, queueTypeId: type.id })
    await jadikanKemarin(event.id, event.timezone)

    // nomornya memang masih berstatus menunggu — hanya tanggalnya yang sudah lewat
    const tertinggal = await prisma.queue.findFirstOrThrow({ where: { id: antrean.id } })
    expect(tertinggal.status).toBe('WAITING')

    await expect(eventService.softDelete(organizationId, event.id)).resolves.toBeTruthy()
    const setelah = await prisma.event.findFirstOrThrow({ where: { id: event.id } })
    expect(setelah.deletedAt).not.toBeNull()
  })

  it('event dengan antrean aktif hari ini tetap ditolak', async () => {
    const event = await makeEvent(organizationId)
    const type = await makeQueueType(event.id, { code: 'B', prefix: 'B' })
    await queueService.create({ eventId: event.id, queueTypeId: type.id })

    await expect(eventService.softDelete(organizationId, event.id))
      .rejects.toMatchObject({ code: 'CONFLICT' })
  })

  it('jenis antrean dengan nomor tertinggal kemarin tetap bisa dihapus', async () => {
    const event = await makeEvent(organizationId)
    const type = await makeQueueType(event.id, { code: 'C', prefix: 'C' })
    await queueService.create({ eventId: event.id, queueTypeId: type.id })
    await jadikanKemarin(event.id, event.timezone)

    await expect(queueTypeService.softDelete(organizationId, type.id)).resolves.toBeTruthy()
  })

  it('jenis antrean dengan antrean aktif hari ini tetap ditolak', async () => {
    const event = await makeEvent(organizationId)
    const type = await makeQueueType(event.id, { code: 'D', prefix: 'D' })
    await queueService.create({ eventId: event.id, queueTypeId: type.id })

    await expect(queueTypeService.softDelete(organizationId, type.id))
      .rejects.toMatchObject({ code: 'CONFLICT' })
  })

  it('daftar event menghitung antrean hari ini saja, bukan sepanjang masa', async () => {
    const event = await makeEvent(organizationId, { name: 'Event Hitung' })
    const type = await makeQueueType(event.id, { code: 'E', prefix: 'E' })

    // tiga nomor kemarin
    for (let i = 0; i < 3; i++) await queueService.create({ eventId: event.id, queueTypeId: type.id })
    await jadikanKemarin(event.id, event.timezone)

    // dua nomor hari ini
    for (let i = 0; i < 2; i++) await queueService.create({ eventId: event.id, queueTypeId: type.id })

    const daftar = await eventService.list(organizationId)
    const baris = daftar.find(e => e.id === event.id)!
    expect(baris.queuesToday).toBe(2)

    // totalnya tetap 5 — angka seumur hidup masih tersedia di halaman detail
    expect(await prisma.queue.count({ where: { eventId: event.id } })).toBe(5)
  })
})
