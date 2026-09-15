import { prisma } from '../utils/prisma'
import { newId } from '../utils/id'
import { createLogger } from '../utils/logger'
import { emitNotification } from '../realtime/emitters'

const log = createLogger('notification')

export type NotificationChannelKey = 'DISPLAY' | 'BROWSER' | 'EMAIL' | 'WHATSAPP' | 'SMS'

export interface NotificationInput {
  organizationId?: string | null
  /** Kosongkan untuk pemberitahuan yang ditujukan ke seluruh admin organisasi. */
  userId?: string | null
  /** Kunci jenis pemberitahuan, mis. `testimonial.created`. */
  type: string
  payload?: Record<string, unknown>
  channels?: NotificationChannelKey[]
}

export interface NotificationDriver {
  channel: NotificationChannelKey
  label: string
  /** Driver yang belum dikonfigurasi tetap terdaftar, tetapi tidak dipakai. */
  isConfigured: () => boolean
  send: (notification: { id: string, input: NotificationInput }) => Promise<void>
}

/**
 * Abstraksi pengiriman pemberitahuan (§47).
 *
 * Bentuknya sengaja driver-based sejak awal: display dan browser sudah jalan,
 * sedangkan email/WhatsApp/SMS terdaftar tetapi belum dikonfigurasi. Menambah
 * kanal nanti berarti menulis satu driver — bukan membongkar pemanggilnya, yang
 * sudah tersebar di beberapa service.
 *
 * Tiap pengiriman dicatat di tabel `notifications` supaya kanal yang gagal bisa
 * ditelusuri, bukan hilang diam-diam.
 */
const drivers = new Map<NotificationChannelKey, NotificationDriver>()

export function registerDriver(driver: NotificationDriver) {
  drivers.set(driver.channel, driver)
}

/** Kanal dalam aplikasi: dikirim lewat WebSocket ke panel admin yang sedang terbuka. */
registerDriver({
  channel: 'BROWSER',
  label: 'Notifikasi Peramban',
  isConfigured: () => true,
  async send({ id, input }) {
    if (!input.organizationId) return
    emitNotification(input.organizationId, {
      id,
      type: input.type,
      payload: input.payload ?? {},
      createdAt: new Date().toISOString(),
    })
  },
})

/** Kanal display: layar yang terpengaruh diminta menyegarkan tampilannya. */
registerDriver({
  channel: 'DISPLAY',
  label: 'Layar Antrean',
  isConfigured: () => true,
  async send({ input }) {
    // Perubahan yang perlu terlihat di layar sudah punya emitter sendiri
    // (queue.*, announcement.*); driver ini hanya mencatat jejaknya.
    log.debug('notifikasi display', { type: input.type })
  },
})

/**
 * Driver yang belum punya kredensial.
 *
 * Sengaja tidak dibuat "berhasil palsu": pengiriman ditandai FAILED dengan alasan
 * yang jelas, sehingga tidak ada yang mengira pesan sudah sampai padahal belum ada
 * penyedia yang dipasang.
 */
for (const [channel, label, envKey] of [
  ['EMAIL', 'Email', 'SMTP_HOST'],
  ['WHATSAPP', 'WhatsApp', 'WHATSAPP_API_URL'],
  ['SMS', 'SMS', 'SMS_API_URL'],
] as Array<[NotificationChannelKey, string, string]>) {
  registerDriver({
    channel,
    label,
    isConfigured: () => Boolean(process.env[envKey]),
    async send() {
      throw new Error(`Kanal ${label} belum dikonfigurasi (${envKey} belum diisi)`)
    },
  })
}

export const notificationService = {
  /** Kanal yang tersedia beserta status konfigurasinya — dipakai halaman pengaturan. */
  channels() {
    return [...drivers.values()].map(d => ({
      channel: d.channel,
      label: d.label,
      isConfigured: d.isConfigured(),
    }))
  },

  async notify(input: NotificationInput) {
    const channels = (input.channels ?? ['BROWSER']).filter((channel) => {
      const driver = drivers.get(channel)
      return driver?.isConfigured()
    })

    const results = await Promise.all(channels.map(async (channel) => {
      const id = newId()
      const driver = drivers.get(channel)!

      try {
        await driver.send({ id, input })
        await record(id, channel, input, 'SENT', null)
        return { channel, status: 'SENT' as const }
      }
      catch (error) {
        const message = (error as Error).message.slice(0, 500)
        log.warn('notifikasi gagal', { channel, type: input.type, message })
        await record(id, channel, input, 'FAILED', message)
        return { channel, status: 'FAILED' as const, error: message }
      }
    }))

    return results
  },

  /** Kirim tanpa menahan permintaan HTTP — kegagalan cukup masuk log dan tabel. */
  notifyAsync(input: NotificationInput) {
    void this.notify(input).catch(error =>
      log.error('notifikasi gagal total', { type: input.type, message: (error as Error).message }))
  },

  /** Riwayat pemberitahuan terbaru satu organisasi. */
  async list(organizationId: string, limit = 30) {
    return prisma.notification.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(100, limit),
      select: { id: true, channel: true, type: true, payload: true, status: true, error: true, createdAt: true },
    })
  },
}

async function record(
  id: string,
  channel: NotificationChannelKey,
  input: NotificationInput,
  status: 'SENT' | 'FAILED',
  error: string | null,
) {
  await prisma.notification.create({
    data: {
      id,
      organizationId: input.organizationId ?? null,
      userId: input.userId ?? null,
      channel,
      type: input.type,
      payload: (input.payload ?? {}) as never,
      status,
      sentAt: status === 'SENT' ? new Date() : null,
      error,
    },
  }).catch(err => log.error('gagal mencatat notifikasi', { message: (err as Error).message }))
}
