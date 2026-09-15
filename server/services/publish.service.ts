import QRCode from 'qrcode'
import { prisma } from '../utils/prisma'
import { errors } from '../utils/response'
import { ERROR_CODES } from '../../shared/constants/errors'
import { newId, newShortCode, slugify } from '../utils/id'

/**
 * Dua alamat untuk satu halaman.
 *
 * `url` memakai kode publikasi — inilah yang dicetak menjadi QR dan bisa diganti
 * kapan saja untuk mematikan cetakan lama. `slugUrl` memakai slug pilihan admin dan
 * tidak pernah berubah sendiri, jadi aman ditempel di situs, dibagikan di pesan,
 * atau ditulis di spanduk. Keduanya membuka halaman yang sama persis.
 */
function publicUrl(path: string) {
  const base = process.env.APP_URL || 'http://localhost:3000'
  return `${base.replace(/\/$/, '')}/p/${path}`
}

function urlsOf(page: { publishCode: string, slug: string | null }) {
  return {
    url: publicUrl(page.publishCode),
    slugUrl: page.slug ? publicUrl(page.slug) : null,
  }
}

export const publishService = {
  async list(organizationId: string, eventId?: string) {
    const pages = await prisma.publicPage.findMany({
      where: {
        deletedAt: null,
        event: { organizationId, deletedAt: null },
        ...(eventId ? { eventId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      include: {
        event: { select: { id: true, name: true, status: true } },
        qrCodes: { where: { isActive: true }, take: 1, orderBy: { version: 'desc' } },
      },
    })

    return pages.map(p => ({ ...p, ...urlsOf(p) }))
  },

  async getById(organizationId: string, id: string) {
    const page = await prisma.publicPage.findFirst({
      where: { id, deletedAt: null, event: { organizationId, deletedAt: null } },
      include: {
        event: { select: { id: true, name: true, status: true } },
        qrCodes: { orderBy: { version: 'desc' } },
      },
    })
    if (!page) throw errors.notFound('Halaman publik tidak ditemukan')
    return { ...page, ...urlsOf(page) }
  },

  async create(organizationId: string, input: {
    eventId: string
    title: string
    subtitle?: string | null
    description?: string | null
    slug?: string | null
    logoUrl?: string | null
    backgroundUrl?: string | null
    infoHtml?: string | null
    allowedQueueTypeIds?: string[]
    maxPerIpPerDay?: number
    requireCaptcha?: boolean
    geofenceEnabled?: boolean
    latitude?: number | null
    longitude?: number | null
    geofenceRadiusM?: number
    theme?: Record<string, unknown>
  }) {
    const event = await prisma.event.findFirst({
      where: { id: input.eventId, organizationId, deletedAt: null },
      select: { id: true },
    })
    if (!event) throw errors.notFound('Event tidak ditemukan')

    const publishCode = await this.uniquePublishCode()
    const slug = input.slug ? await this.uniqueSlug(input.slug) : null

    const page = await prisma.publicPage.create({
      data: {
        id: newId(),
        eventId: input.eventId,
        publishCode,
        slug,
        title: input.title,
        subtitle: input.subtitle ?? null,
        description: input.description ?? null,
        logoUrl: input.logoUrl || null,
        backgroundUrl: input.backgroundUrl || null,
        infoHtml: input.infoHtml || null,
        theme: (input.theme ?? { primaryColor: '#1b5cf5' }) as never,
        allowedQueueTypeIds: (input.allowedQueueTypeIds ?? []) as never,
        maxPerIpPerDay: input.maxPerIpPerDay ?? 5,
        requireCaptcha: input.requireCaptcha ?? false,
        geofenceEnabled: input.geofenceEnabled ?? false,
        latitude: input.latitude ?? null,
        longitude: input.longitude ?? null,
        geofenceRadiusM: input.geofenceRadiusM ?? 1000,
        isPublished: false,
      },
    })

    await this.regenerateQr(organizationId, page.id)
    return this.getById(organizationId, page.id)
  },

  async update(organizationId: string, id: string, input: Record<string, unknown>) {
    const page = await this.getById(organizationId, id)

    /**
     * Pagar lokasi tanpa titik koordinat adalah pagar yang tidak bisa menolak siapa
     * pun. Ditolak di sini — bukan didiamkan lalu diperlakukan sebagai mati di
     * halaman publik — supaya admin tahu setelannya belum selesai.
     */
    const geofenceAktif = input.geofenceEnabled !== undefined ? Boolean(input.geofenceEnabled) : page.geofenceEnabled
    const lat = input.latitude !== undefined ? input.latitude : page.latitude
    const lng = input.longitude !== undefined ? input.longitude : page.longitude
    if (geofenceAktif && (lat === null || lat === undefined || lng === null || lng === undefined)) {
      throw errors.badRequest(
        ERROR_CODES.VALIDATION_ERROR,
        'Tentukan titik lokasi dulu sebelum menyalakan pagar lokasi.',
      )
    }

    const slug = typeof input.slug === 'string' && input.slug && input.slug !== page.slug
      ? await this.uniqueSlug(input.slug, id)
      : undefined

    await prisma.publicPage.update({
      where: { id },
      data: {
        ...(input.title !== undefined ? { title: input.title as string } : {}),
        ...(input.subtitle !== undefined ? { subtitle: (input.subtitle as string) || null } : {}),
        ...(input.description !== undefined ? { description: (input.description as string) || null } : {}),
        ...(slug !== undefined ? { slug } : {}),
        ...(input.logoUrl !== undefined ? { logoUrl: (input.logoUrl as string) || null } : {}),
        ...(input.backgroundUrl !== undefined ? { backgroundUrl: (input.backgroundUrl as string) || null } : {}),
        ...(input.theme !== undefined ? { theme: input.theme as never } : {}),
        ...(input.infoHtml !== undefined ? { infoHtml: (input.infoHtml as string) || null } : {}),
        ...(input.allowedQueueTypeIds !== undefined ? { allowedQueueTypeIds: input.allowedQueueTypeIds as never } : {}),
        ...(input.maxPerIpPerDay !== undefined ? { maxPerIpPerDay: Number(input.maxPerIpPerDay) } : {}),
        ...(input.requireCaptcha !== undefined ? { requireCaptcha: Boolean(input.requireCaptcha) } : {}),
        ...(input.geofenceEnabled !== undefined ? { geofenceEnabled: Boolean(input.geofenceEnabled) } : {}),
        ...(input.latitude !== undefined ? { latitude: input.latitude as number | null } : {}),
        ...(input.longitude !== undefined ? { longitude: input.longitude as number | null } : {}),
        ...(input.geofenceRadiusM !== undefined ? { geofenceRadiusM: Number(input.geofenceRadiusM) } : {}),
      },
    })

    return this.getById(organizationId, id)
  },

  /** Publikasikan / tarik halaman tanpa menghapus data (§57.12). */
  async setPublished(organizationId: string, id: string, isPublished: boolean) {
    await this.getById(organizationId, id)
    await prisma.publicPage.update({ where: { id }, data: { isPublished } })
    return this.getById(organizationId, id)
  },

  async softDelete(organizationId: string, id: string) {
    const page = await this.getById(organizationId, id)
    await prisma.publicPage.update({ where: { id }, data: { deletedAt: new Date(), isPublished: false } })
    return page
  },

  /**
   * Regenerate QR: kode publikasi baru + baris qr_codes versi berikutnya.
   * Versi lama disimpan (bukan ditimpa) supaya bisa diaudit.
   */
  async regenerateQr(organizationId: string, id: string, rotateCode = false) {
    const page = await prisma.publicPage.findFirst({
      where: { id, deletedAt: null, event: { organizationId, deletedAt: null } },
      select: { id: true, publishCode: true },
    })
    if (!page) throw errors.notFound('Halaman publik tidak ditemukan')

    let publishCode = page.publishCode
    if (rotateCode) {
      publishCode = await this.uniquePublishCode()
      await prisma.publicPage.update({ where: { id }, data: { publishCode } })
    }

    const last = await prisma.qrCode.findFirst({
      where: { publicPageId: id },
      orderBy: { version: 'desc' },
      select: { version: true },
    })

    await prisma.qrCode.updateMany({ where: { publicPageId: id }, data: { isActive: false } })
    const qr = await prisma.qrCode.create({
      data: {
        id: newId(),
        publicPageId: id,
        code: publishCode,
        targetUrl: publicUrl(publishCode),
        version: (last?.version ?? 0) + 1,
        isActive: true,
      },
    })

    return { ...qr, url: qr.targetUrl }
  },

  /** Render QR sebagai PNG (buffer) atau SVG (string) — tidak perlu menyimpan berkas. */
  async renderQr(organizationId: string, id: string, format: 'png' | 'svg', size = 600) {
    const page = await this.getById(organizationId, id)
    const url = page.url
    const options = { width: size, margin: 2, errorCorrectionLevel: 'M' as const }

    if (format === 'svg') {
      return { body: await QRCode.toString(url, { ...options, type: 'svg' }), mime: 'image/svg+xml' }
    }
    return { body: await QRCode.toBuffer(url, { ...options, type: 'png' }), mime: 'image/png' }
  },

  async uniquePublishCode(): Promise<string> {
    for (let i = 0; i < 10; i++) {
      const code = newShortCode(8)
      const clash = await prisma.publicPage.findFirst({ where: { publishCode: code }, select: { id: true } })
      if (!clash) return code
    }
    throw errors.badRequest(ERROR_CODES.INTERNAL_ERROR, 'Gagal membuat kode publikasi')
  },

  async uniqueSlug(base: string, excludeId?: string): Promise<string> {
    const root = slugify(base) || 'antrean'
    let candidate = root
    let n = 1
    while (true) {
      const clash = await prisma.publicPage.findFirst({
        where: { slug: candidate, ...(excludeId ? { id: { not: excludeId } } : {}) },
        select: { id: true },
      })
      if (!clash) return candidate
      candidate = `${root}-${++n}`
    }
  },
}
