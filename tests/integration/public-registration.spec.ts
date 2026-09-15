import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ulid } from 'ulid'
import { prisma } from '../../server/utils/prisma'
import { publicPageService } from '../../server/services/public-page.service'
import { eventService } from '../../server/services/event.service'
import { makeEvent, makeOrganization, makeQueueType, resetDatabase } from '../helpers/factory'

/** §4, §10, §36, §57.11, §57.12 — aturan pendaftaran publik. */
describe('pendaftaran antrean publik', () => {
  let organizationId: string
  let eventId: string
  let queueTypeId: string
  let publishCode: string

  async function makePublicPage(eventIdParam: string, overrides: Partial<{ isPublished: boolean, maxPerIpPerDay: number, allowed: string[] }> = {}) {
    const code = `pub${ulid().slice(-8).toLowerCase()}`
    await prisma.publicPage.create({
      data: {
        id: ulid(),
        eventId: eventIdParam,
        publishCode: code,
        title: 'Halaman Uji',
        isPublished: overrides.isPublished ?? true,
        maxPerIpPerDay: overrides.maxPerIpPerDay ?? 0,
        allowedQueueTypeIds: (overrides.allowed ?? []) as never,
      },
    })
    return code
  }

  async function makeForm(eventIdParam: string) {
    const form = await prisma.formDefinition.create({
      data: { id: ulid(), eventId: eventIdParam, name: 'Form Uji', isActive: true },
    })
    await prisma.formField.createMany({
      data: [
        { id: ulid(), formDefinitionId: form.id, key: 'full_name', label: 'Nama Lengkap', type: 'TEXT', isRequired: true, displayOrder: 1 },
        { id: ulid(), formDefinitionId: form.id, key: 'phone', label: 'Nomor HP', type: 'PHONE', isRequired: true, displayOrder: 2 },
        { id: ulid(), formDefinitionId: form.id, key: 'purpose', label: 'Keperluan', type: 'TEXTAREA', isRequired: false, displayOrder: 3 },
      ],
    })
    return form
  }

  beforeAll(async () => {
    await resetDatabase()
    const org = await makeOrganization()
    const event = await makeEvent(org.id)
    const queueType = await makeQueueType(event.id, { code: 'A', prefix: 'A' })
    organizationId = org.id
    eventId = event.id
    queueTypeId = queueType.id
    publishCode = await makePublicPage(event.id)
    await makeForm(event.id)
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  it('halaman terbit mengembalikan layanan, formulir, dan status buka', async () => {
    const data = await publicPageService.getByPublishCode(publishCode)

    expect(data.page.title).toBe('Halaman Uji')
    expect(data.openState.acceptsNewQueue).toBe(true)
    expect(data.queueTypes.map(q => q.code)).toContain('A')
    expect(data.form?.fields.map(f => f.key)).toEqual(['full_name', 'phone', 'purpose'])
  })

  it('pengunjung mendapat nomor antrean beserta token pelacakan', async () => {
    const queue = await publicPageService.register({
      publishCode,
      queueTypeId,
      values: { full_name: 'Siti Aminah', phone: '081234567890', purpose: 'Konsultasi' },
      ipAddress: '10.0.0.1',
    })

    expect(queue.queueNumber).toMatch(/^A\d{3}$/)
    expect(queue.publicToken).toHaveLength(43)

    const visitor = await prisma.visitor.findFirstOrThrow({ where: { id: queue.visitorId! } })
    expect(visitor.fullName).toBe('Siti Aminah')
    expect(visitor.phone).toBe('081234567890')

    // jawaban tersimpan sebagai EAV sekaligus snapshot JSON
    const values = await prisma.visitorFieldValue.findMany({ where: { visitorId: visitor.id } })
    expect(values.map(v => v.fieldKey).sort()).toEqual(['full_name', 'phone', 'purpose'])
    expect((visitor.data as Record<string, unknown>).full_name).toBe('Siti Aminah')
  })

  it('field wajib yang kosong ditolak dengan pesan per-field', async () => {
    await expect(
      publicPageService.register({ publishCode, queueTypeId, values: { purpose: 'Tanpa nama' } }),
    ).rejects.toMatchObject({ name: 'ZodError' })
  })

  it('nomor HP dengan format salah ditolak', async () => {
    await expect(
      publicPageService.register({
        publishCode,
        queueTypeId,
        values: { full_name: 'Budi', phone: 'bukan-nomor' },
      }),
    ).rejects.toMatchObject({ name: 'ZodError' })
  })

  it('halaman yang tidak dipublikasikan menolak akses tanpa menghapus data (§57.12)', async () => {
    const code = await makePublicPage(eventId, { isPublished: false })

    await expect(publicPageService.getByPublishCode(code)).rejects.toMatchObject({ code: 'PAGE_NOT_PUBLISHED' })
    await expect(
      publicPageService.register({ publishCode: code, queueTypeId, values: { full_name: 'A', phone: '08123456789' } }),
    ).rejects.toMatchObject({ code: 'PAGE_NOT_PUBLISHED' })

    const stillThere = await prisma.publicPage.findFirst({ where: { publishCode: code } })
    expect(stillThere).toBeTruthy()
  })

  it('event CLOSED menolak antrean baru (§57.11)', async () => {
    const org = await prisma.organization.findFirstOrThrow({ where: { id: organizationId } })
    const closed = await makeEvent(org.id, { status: 'CLOSED' })
    const type = await makeQueueType(closed.id, { code: 'A', prefix: 'A' })
    const code = await makePublicPage(closed.id)

    await expect(
      publicPageService.register({ publishCode: code, queueTypeId: type.id, values: {} }),
    ).rejects.toMatchObject({ code: 'EVENT_NOT_OPEN' })
  })

  it('event PAUSED menolak antrean baru dengan pesan berbeda', async () => {
    const paused = await makeEvent(organizationId, { status: 'PAUSED' })
    const type = await makeQueueType(paused.id, { code: 'A', prefix: 'A' })
    const code = await makePublicPage(paused.id)

    await expect(
      publicPageService.register({ publishCode: code, queueTypeId: type.id, values: {} }),
    ).rejects.toMatchObject({ code: 'EVENT_PAUSED' })
  })

  it('di luar jam layanan pendaftaran ditutup (§10)', async () => {
    const event = await makeEvent(organizationId)
    const type = await makeQueueType(event.id, { code: 'A', prefix: 'A' })
    const code = await makePublicPage(event.id)

    // tutup seluruh hari
    await prisma.eventSchedule.updateMany({ where: { eventId: event.id }, data: { isClosed: true } })

    const state = await eventService.getOpenState(event.id)
    expect(state.acceptsNewQueue).toBe(false)

    await expect(
      publicPageService.register({ publishCode: code, queueTypeId: type.id, values: {} }),
    ).rejects.toMatchObject({ code: 'OUTSIDE_SERVICE_HOURS' })
  })

  it('batas pengambilan per IP per hari ditegakkan', async () => {
    const event = await makeEvent(organizationId)
    const type = await makeQueueType(event.id, { code: 'A', prefix: 'A' })
    const code = await makePublicPage(event.id, { maxPerIpPerDay: 2 })

    await publicPageService.register({ publishCode: code, queueTypeId: type.id, values: {}, ipAddress: '10.9.9.9' })
    await publicPageService.register({ publishCode: code, queueTypeId: type.id, values: {}, ipAddress: '10.9.9.9' })

    await expect(
      publicPageService.register({ publishCode: code, queueTypeId: type.id, values: {}, ipAddress: '10.9.9.9' }),
    ).rejects.toMatchObject({ code: 'DAILY_LIMIT_REACHED' })

    // IP lain tetap boleh
    await expect(
      publicPageService.register({ publishCode: code, queueTypeId: type.id, values: {}, ipAddress: '10.9.9.10' }),
    ).resolves.toBeTruthy()
  })

  it('layanan di luar daftar yang diizinkan halaman ditolak', async () => {
    const event = await makeEvent(organizationId)
    const allowedType = await makeQueueType(event.id, { code: 'A', prefix: 'A' })
    const hiddenType = await makeQueueType(event.id, { code: 'B', prefix: 'B' })
    const code = await makePublicPage(event.id, { allowed: [allowedType.id] })

    const page = await publicPageService.getByPublishCode(code)
    expect(page.queueTypes.map(q => q.id)).toEqual([allowedType.id])

    await expect(
      publicPageService.register({ publishCode: code, queueTypeId: hiddenType.id, values: {} }),
    ).rejects.toMatchObject({ code: 'QUEUE_TYPE_UNAVAILABLE' })
  })

  it('kuota antrean menunggu per layanan ditegakkan', async () => {
    const event = await makeEvent(organizationId)
    const type = await makeQueueType(event.id, { code: 'A', prefix: 'A', maxWaiting: 2 })
    const code = await makePublicPage(event.id)

    await publicPageService.register({ publishCode: code, queueTypeId: type.id, values: {} })
    await publicPageService.register({ publishCode: code, queueTypeId: type.id, values: {} })

    await expect(
      publicPageService.register({ publishCode: code, queueTypeId: type.id, values: {} }),
    ).rejects.toMatchObject({ code: 'QUEUE_LIMIT_REACHED' })
  })
})
