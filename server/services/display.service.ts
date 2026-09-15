import { prisma } from '../utils/prisma'
import { errors } from '../utils/response'
import { ERROR_CODES } from '../../shared/constants/errors'
import { newId, newShortCode } from '../utils/id'
import { storage } from '../utils/storage'
import { systemToneUrl } from '../../shared/constants/tones'
import { hashToken, randomToken } from '../utils/crypto'
import { queueService } from './queue.service'
import { eventService } from './event.service'
import { settingService } from './setting.service'
import { SETTING_KEYS } from '../../shared/constants/settings'

/**
 * Kumpulkan berkas yang dirujuk widget sebuah template.
 * Dikembalikan sebagai peta id → URL agar renderer tinggal memakainya.
 */
export async function resolveTemplateAssets(
  widgets: Array<{ mediaId: string | null, playlistId: string | null }>,
) {
  const mediaIds = [...new Set(widgets.map(w => w.mediaId).filter(Boolean) as string[])]
  const playlistIds = [...new Set(widgets.map(w => w.playlistId).filter(Boolean) as string[])]

  const [media, playlists] = await Promise.all([
    mediaIds.length
      ? prisma.media.findMany({
          where: { id: { in: mediaIds }, deletedAt: null },
          select: { id: true, type: true, filePath: true },
        })
      : [],
    playlistIds.length
      ? prisma.playlist.findMany({
          where: { id: { in: playlistIds } },
          select: {
            id: true,
            items: {
              orderBy: { displayOrder: 'asc' },
              select: {
                durationSeconds: true,
                media: { select: { id: true, type: true, filePath: true } },
              },
            },
          },
        })
      : [],
  ])

  return {
    mediaById: Object.fromEntries(
      media.map(m => [m.id, { url: storage.publicUrl(m.filePath), type: m.type }]),
    ),
    playlistById: Object.fromEntries(
      playlists.map(p => [
        p.id,
        {
          items: p.items.map(i => ({
            durationSeconds: i.durationSeconds,
            media: { url: storage.publicUrl(i.media.filePath), type: i.media.type },
          })),
        },
      ]),
    ),
  }
}

/** Jeda minimal antar penulisan `last_seen_at` untuk satu perangkat. */
const TOUCH_INTERVAL_MS = 60_000

/**
 * Perbarui penanda "terakhir terlihat" secukupnya saja.
 * Tanpa ini, satu display menghasilkan ~12 UPDATE/menit (polling + heartbeat);
 * pada 200 layar itu 2.400 UPDATE/menit hanya untuk satu indikator.
 */
export async function touchDevice(deviceId: string, lastSeenAt: Date | null | undefined) {
  if (lastSeenAt && Date.now() - lastSeenAt.getTime() < TOUCH_INTERVAL_MS) return false
  await prisma.displayDevice.update({
    where: { id: deviceId },
    data: { lastSeenAt: new Date(), status: 'ONLINE' },
  }).catch(() => {})
  return true
}

export const displayService = {
  /** Seluruh data yang dibutuhkan satu layar untuk merender dirinya (§17, §18, §45). */
  async state(deviceCode: string) {
    const device = await prisma.displayDevice.findFirst({
      where: { deviceCode, deletedAt: null },
      include: {
        queueType: { select: { id: true, code: true, name: true, color: true, icon: true } },
        template: { include: { widgets: { orderBy: { zIndex: 'asc' } } } },
        event: {
          select: {
            id: true,
            name: true,
            timezone: true,
            status: true,
            branding: true,
            settings: true,
            organizationId: true,
            organization: { select: { name: true, logoUrl: true } },
          },
        },
      },
    })
    if (!device) throw errors.notFound('Perangkat display tidak ditemukan')

    /**
     * Isian formulir yang diminta template ini.
     *
     * Dihitung dari widget-nya, bukan dikirim borongan: perangkat hanya menerima
     * field yang memang dipasang admin di layar (§18). Widget "Data Pengunjung"
     * menyimpan pilihannya sebagai `config.fields = [{ key, label }]`.
     */
    const visitorFieldKeys = (device.template?.widgets ?? []).flatMap((widget) => {
      const fields = (widget.config as { fields?: Array<{ key?: unknown }> } | null)?.fields
      if (!Array.isArray(fields)) return []
      return fields.map(f => (typeof f?.key === 'string' ? f.key : null)).filter((k): k is string => !!k)
    })

    const [settings, board, openState, announcements] = await Promise.all([
      settingService.forEvent(device.event),
      queueService.publicBoard(device.eventId, { visitorFieldKeys }),
      eventService.getOpenState(device.eventId),
      prisma.announcement.findMany({
        where: {
          eventId: device.eventId,
          isActive: true,
          OR: [{ startsAt: null }, { startsAt: { lte: new Date() } }],
          AND: [{ OR: [{ endsAt: null }, { endsAt: { gte: new Date() } }] }],
        },
        orderBy: { priority: 'desc' },
        take: 5,
        select: { id: true, title: true, message: true, type: true },
      }),
    ])

    const filtered = device.type === 'QUEUE_TYPE' && device.queueTypeId
      ? board.board.filter(b => b.queueType.id === device.queueTypeId)
      : board.board

    /**
     * Perangkat yang dikunci pada satu layanan hanya menerima loket yang MELAYANI
     * layanan itu — kalau tidak, papan per loket ikut menampilkan loket yang tidak
     * ada hubungannya dengan layar tersebut.
     */
    const counters = device.type === 'QUEUE_TYPE' && device.queueTypeId
      ? board.counters.filter(c => c.services.some(s => s.id === device.queueTypeId))
      : board.counters

    // Jangan menulis pada setiap pembacaan: display polling tiap 10 detik, dan
    // indikator "terakhir terlihat" tidak butuh presisi setinggi itu (§45).
    await touchDevice(device.id, device.lastSeenAt)

    // Media & playlist yang dirujuk widget dikirim sekalian, supaya layar tidak
    // perlu memanggil endpoint tambahan hanya untuk mengetahui URL berkasnya.
    const assets = device.template
      ? await resolveTemplateAssets(device.template.widgets)
      : { mediaById: {}, playlistById: {} }

    return {
      device: {
        id: device.id,
        deviceCode: device.deviceCode,
        name: device.name,
        type: device.type,
        queueType: device.queueType,
        isPaired: !!device.deviceTokenHash,
      },
      template: device.template,
      event: board.event,
      organization: device.event.organization,
      branding: device.event.branding,
      serviceDate: board.serviceDate,
      openState,
      /**
       * Layar tidak menyimpan preferensinya sendiri: perilaku suara datang dari
       * pengaturan sistem, yang boleh ditimpa per event (§49). Nada panggil dikirim
       * sebagai URL siap pakai — layar tidak perlu tahu soal id media, dan id yang
       * berkasnya sudah dihapus otomatis jatuh ke `null` di sini, bukan jadi
       * permintaan 404 di perangkat.
       */
      settings: {
        voiceEnabled: Boolean(settings[SETTING_KEYS.DISPLAY_VOICE_ENABLED]),
        voiceLanguage: String(settings[SETTING_KEYS.DISPLAY_VOICE_LANGUAGE]),
        voiceProvider: String(settings[SETTING_KEYS.DISPLAY_VOICE_PROVIDER] ?? 'browser'),
        voiceChimeUrl: await resolveChimeUrl(
          device.event.organizationId,
          String(settings[SETTING_KEYS.DISPLAY_VOICE_CHIME_MEDIA_ID] ?? ''),
        ),
      },
      board: filtered,
      counters,
      announcements,
      ...assets,
    }
  },

  /** Pairing perangkat: sekali jalan, tokennya disimpan ter-hash (§45). */
  async pair(deviceCode: string, ip?: string | null) {
    const device = await prisma.displayDevice.findFirst({
      where: { deviceCode, deletedAt: null },
      select: { id: true, deviceTokenHash: true },
    })
    if (!device) throw errors.notFound('Perangkat display tidak ditemukan')
    if (device.deviceTokenHash) {
      throw errors.conflict(ERROR_CODES.CONFLICT, 'Perangkat sudah dipasangkan. Reset dari panel admin bila ingin memasangkan ulang.')
    }

    const token = randomToken(32)
    await prisma.displayDevice.update({
      where: { id: device.id },
      data: {
        deviceTokenHash: hashToken(token),
        status: 'ONLINE',
        lastSeenAt: new Date(),
        lastIp: ip ?? null,
      },
    })

    return { deviceToken: token }
  },

  async list(organizationId: string, eventId?: string) {
    const [devices, timeoutSeconds] = await Promise.all([
      prisma.displayDevice.findMany({
        where: {
          deletedAt: null,
          event: { organizationId, deletedAt: null },
          ...(eventId ? { eventId } : {}),
        },
        orderBy: { createdAt: 'desc' },
        include: {
          queueType: { select: { id: true, code: true, name: true } },
          event: { select: { id: true, name: true } },
        },
      }),
      settingService.get<number>(organizationId, SETTING_KEYS.DISPLAY_TIMEOUT_SECONDS),
    ])

    /**
     * Status dihitung saat dibaca, bukan diambil dari kolomnya.
     *
     * Kolom `status` hanya berubah menjadi ONLINE ketika layar menyapa; layar yang
     * dicabut kabelnya tidak pernah mengabari siapa pun, jadi kalau kolomnya
     * dipercaya begitu saja perangkat mati akan selamanya tampak menyala.
     *
     * Ambangnya ditambah satu interval `touchDevice`, sebab layar yang sehat pun
     * sengaja hanya menulis `last_seen_at` sekali per menit.
     */
    const staleAfterMs = timeoutSeconds * 1000 + TOUCH_INTERVAL_MS
    const now = Date.now()

    return devices.map(({ deviceTokenHash, ...device }) => ({
      ...device,
      isPaired: !!deviceTokenHash,
      status: !deviceTokenHash
        ? 'UNPAIRED'
        : device.lastSeenAt && now - device.lastSeenAt.getTime() <= staleAfterMs
          ? 'ONLINE'
          : 'OFFLINE',
    }))
  },

  async create(organizationId: string, input: {
    eventId: string
    name: string
    type: 'GLOBAL' | 'QUEUE_TYPE'
    queueTypeId?: string | null
  }) {
    const event = await prisma.event.findFirst({
      where: { id: input.eventId, organizationId, deletedAt: null },
      select: { id: true },
    })
    if (!event) throw errors.notFound('Event tidak ditemukan')

    if (input.type === 'QUEUE_TYPE' && !input.queueTypeId) {
      throw errors.validation('Display per layanan wajib memilih jenis antrean')
    }

    return prisma.displayDevice.create({
      data: {
        id: newId(),
        eventId: input.eventId,
        deviceCode: newShortCode(8),
        name: input.name,
        type: input.type,
        queueTypeId: input.type === 'QUEUE_TYPE' ? input.queueTypeId ?? null : null,
        status: 'UNPAIRED',
      },
    })
  },

  async remove(organizationId: string, id: string) {
    const device = await prisma.displayDevice.findFirst({
      where: { id, event: { organizationId, deletedAt: null } },
      select: { id: true, name: true },
    })
    if (!device) throw errors.notFound('Perangkat display tidak ditemukan')
    await prisma.displayDevice.update({ where: { id }, data: { deletedAt: new Date() } })
    return device
  },

  async resetPairing(organizationId: string, id: string) {
    const device = await prisma.displayDevice.findFirst({
      where: { id, event: { organizationId, deletedAt: null } },
      select: { id: true },
    })
    if (!device) throw errors.notFound('Perangkat display tidak ditemukan')
    return prisma.displayDevice.update({
      where: { id },
      data: { deviceTokenHash: null, status: 'UNPAIRED' },
    })
  },
}

/**
 * URL berkas nada panggil, bila memang masih ada dan memang audio.
 *
 * Diperiksa ulang di sini karena berkasnya bisa dihapus jauh setelah dipilih;
 * lebih baik layar tidak berbunyi daripada mencoba memutar berkas yang sudah tiada.
 */
async function resolveChimeUrl(organizationId: string, mediaId: string) {
  if (!mediaId) return null

  // Nada bawaan ikut di dalam aplikasi, jadi tidak perlu menyentuh database sama sekali.
  const bawaan = systemToneUrl(mediaId)
  if (bawaan) return bawaan

  const media = await prisma.media.findFirst({
    where: { id: mediaId, organizationId, type: 'AUDIO', deletedAt: null },
    select: { filePath: true },
  })
  return media ? storage.publicUrl(media.filePath) : null
}
