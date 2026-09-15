import { prisma } from '../utils/prisma'
import { errors } from '../utils/response'
import { ERROR_CODES } from '../../shared/constants/errors'
import { formatServiceDate, resolveServiceDate } from '../utils/datetime'
import { buildFormValidator, extractVisitorCore } from '../utils/dynamic-form'
import { verifyCaptcha } from '../utils/captcha'
import { consumeTicket } from '../utils/slider-captcha'
import { eventService } from './event.service'
import { queueService } from './queue.service'
import { settingService } from './setting.service'
import { datasourceService } from './datasource.service'
import { SETTING_KEYS } from '../../shared/constants/settings'
import { parsePublicPageTheme } from '../../shared/schemas/public-page'
import { byCodeOrSlug, pickCanonical } from '../utils/public-page-lookup'
import { assertInsideGeofence, evaluateGeofence } from '../utils/geofence'
import type { Coordinates } from '../../shared/utils/geo'

export const publicPageService = {
  /**
   * Konfigurasi halaman publik + layanan yang tersedia + status buka (§4).
   *
   * `visitor` hanya perlu diisi untuk halaman yang dipagari lokasi; halaman lain
   * mengabaikannya. Pemeriksaannya ada di sini, bukan di antarmuka, karena
   * menyembunyikan tombol tidak menghalangi siapa pun memanggil API-nya langsung.
   */
  async getByPublishCode(publishCode: string, visitor: Coordinates | null = null) {
    const kandidat = await prisma.publicPage.findMany({
      where: { deletedAt: null, ...byCodeOrSlug(publishCode) },
      take: 2,
      include: {
        event: {
          select: {
            id: true,
            name: true,
            status: true,
            timezone: true,
            branding: true,
            settings: true,
            organizationId: true,
            // Tanggal event dipakai hero halaman publik (§48) — "12–16 September 2026".
            startDate: true,
            endDate: true,
            organization: { select: { name: true, logoUrl: true } },
          },
        },
      },
    })

    const page = pickCanonical(kandidat, publishCode)
    if (!page) throw errors.notFound('Halaman antrean tidak ditemukan')
    if (!page.isPublished) {
      throw errors.badRequest(ERROR_CODES.PAGE_NOT_PUBLISHED, 'Halaman antrean ini sedang tidak aktif')
    }

    /**
     * Pengunjung di luar pagar tidak menerima isi halaman sama sekali — bukan isi
     * lengkap yang tombolnya dimatikan. Yang dikirim hanya secukupnya untuk
     * menggambar layar penolakan dengan identitas yang benar: judul, logo, warna,
     * dan titik lokasinya supaya ia tahu harus ke mana.
     */
    const geofence = evaluateGeofence(page, visitor)
    if (!geofence.inside) {
      return {
        access: 'geofenced' as const,
        geofence,
        page: {
          publishCode: page.publishCode,
          title: page.title,
          subtitle: page.subtitle,
          logoUrl: page.logoUrl,
          backgroundUrl: page.backgroundUrl,
          theme: parsePublicPageTheme(page.theme),
        },
        organization: page.event.organization,
      }
    }

    const allowed = Array.isArray(page.allowedQueueTypeIds)
      ? (page.allowedQueueTypeIds as string[])
      : []

    const [settings, queueTypes, form, openState] = await Promise.all([
      settingService.forEvent(page.event),
      prisma.queueType.findMany({
        where: {
          eventId: page.eventId,
          isActive: true,
          deletedAt: null,
          ...(allowed.length ? { id: { in: allowed } } : {}),
        },
        orderBy: { displayOrder: 'asc' },
        select: { id: true, code: true, name: true, description: true, color: true, icon: true, estServiceSeconds: true, maxWaiting: true },
      }),
      prisma.formDefinition.findFirst({
        where: { eventId: page.eventId, isActive: true },
        orderBy: { createdAt: 'desc' },
        include: {
          fields: { orderBy: { displayOrder: 'asc' } },
          dataSource: { select: { id: true, isActive: true, queryTemplate: true } },
        },
      }),
      eventService.getOpenState(page.eventId),
    ])

    const serviceDate = resolveServiceDate(page.event.timezone)
    const waitingCounts = await prisma.queue.groupBy({
      by: ['queueTypeId'],
      where: {
        eventId: page.eventId,
        serviceDate,
        status: 'WAITING',
        deletedAt: null,
      },
      _count: { _all: true },
    })

    return {
      access: 'granted' as const,
      geofence,
      page: {
        publishCode: page.publishCode,
        slug: page.slug,
        title: page.title,
        subtitle: page.subtitle,
        description: page.description,
        logoUrl: page.logoUrl,
        backgroundUrl: page.backgroundUrl,
        /**
         * Tema dikirim sudah lengkap dengan nilai bawaannya.
         *
         * Halaman publik dan pratinjau builder memakai komponen yang sama; bila
         * masing-masing menambal sendiri kunci yang kosong, keduanya pelan-pelan
         * berbeda. Normalisasinya cukup sekali, di sini.
         */
        theme: parsePublicPageTheme(page.theme),
        infoHtml: page.infoHtml,
        requireCaptcha: page.requireCaptcha,
      },
      organization: page.event.organization,
      event: {
        id: page.event.id,
        name: page.event.name,
        status: page.event.status,
        timezone: page.event.timezone,
        branding: page.event.branding,
        startDate: page.event.startDate ? formatServiceDate(page.event.startDate) : null,
        endDate: page.event.endDate ? formatServiceDate(page.event.endDate) : null,
      },
      openState,
      // Fitur yang boleh dipakai halaman ini — halaman publik merender sesuai ini (§49).
      features: {
        publicRegistration: Boolean(settings[SETTING_KEYS.QUEUE_PUBLIC_REGISTRATION]),
        ratingEnabled: Boolean(settings[SETTING_KEYS.FEEDBACK_RATING_ENABLED]),
      },
      queueTypes: queueTypes.map(qt => ({
        ...qt,
        waitingCount: waitingCounts.find(w => w.queueTypeId === qt.id)?._count._all ?? 0,
      })),
      form: form
        ? {
            id: form.id,
            name: form.name,
            description: form.description,
            /** Halaman publik memunculkan captcha geser sebelum mengirim bila ini menyala (§36). */
            requireCaptcha: form.requireCaptcha,
            /**
             * Field pemicu autofill — halaman publik menampilkan tombol "Cari data"
             * di sebelahnya. Kosong berarti fitur ini tidak aktif untuk formulir itu.
             */
            autofillFieldKey: form.dataSource?.isActive
              ? ((form.dataSource.queryTemplate as { lookupFieldKey?: string } | null)?.lookupFieldKey ?? null)
              : null,
            fields: form.fields.map(f => ({
              id: f.id,
              key: f.key,
              label: f.label,
              type: f.type,
              placeholder: f.placeholder,
              helpText: f.helpText,
              isRequired: f.isRequired,
              defaultValue: f.defaultValue,
              options: f.options,
              validation: f.validation,
              visibility: f.visibility,
            })),
          }
        : null,
    }
  },

  /**
   * Isi otomatis formulir dari sumber data eksternal (§6).
   *
   * Daftar field yang boleh diisi diambil dari definisi formulir aktif, bukan dari
   * pemetaan — sehingga respons pihak ketiga tidak bisa menitipkan kunci lain.
   */
  async autofill(publishCode: string, lookup: string, visitor: Coordinates | null = null) {
    const page = pickCanonical(
      await prisma.publicPage.findMany({
        where: { deletedAt: null, isPublished: true, ...byCodeOrSlug(publishCode) },
        take: 2,
        select: {
          publishCode: true,
          eventId: true,
          geofenceEnabled: true,
          latitude: true,
          longitude: true,
          geofenceRadiusM: true,
        },
      }),
      publishCode,
    )
    if (!page) throw errors.notFound('Halaman antrean tidak ditemukan')

    // Isi otomatis menarik data dari sistem luar; jangan dibuka dari luar pagar.
    assertInsideGeofence(evaluateGeofence(page, visitor))

    const form = await prisma.formDefinition.findFirst({
      where: { eventId: page.eventId, isActive: true },
      orderBy: { createdAt: 'desc' },
      select: {
        dataSourceId: true,
        fields: { select: { key: true } },
      },
    })

    if (!form?.dataSourceId) {
      throw errors.badRequest(ERROR_CODES.DATA_SOURCE_DISABLED, 'Formulir ini tidak terhubung ke sumber data')
    }

    return datasourceService.autofill({
      dataSourceId: form.dataSourceId,
      lookup,
      allowedFieldKeys: form.fields.map(f => f.key),
    })
  },

  /** Pengunjung mengambil nomor antrean (§4, §57.11). */
  async register(params: {
    publishCode: string
    queueTypeId: string
    values: Record<string, unknown>
    captchaToken?: string | null
    sliderToken?: string | null
    /** Koordinat pengunjung; hanya dipakai halaman yang dipagari lokasi. */
    visitor?: Coordinates | null
    ipAddress?: string | null
    userAgent?: string | null
  }) {
    const kandidatDaftar = await prisma.publicPage.findMany({
      where: { deletedAt: null, ...byCodeOrSlug(params.publishCode) },
      take: 2,
      select: {
        publishCode: true,
        id: true,
        eventId: true,
        isPublished: true,
        allowedQueueTypeIds: true,
        maxPerIpPerDay: true,
        requireCaptcha: true,
        geofenceEnabled: true,
        latitude: true,
        longitude: true,
        geofenceRadiusM: true,
        event: { select: { organizationId: true, settings: true, timezone: true } },
      },
    })
    const page = pickCanonical(kandidatDaftar, params.publishCode)
    if (!page) throw errors.notFound('Halaman antrean tidak ditemukan')
    if (!page.isPublished) {
      throw errors.badRequest(ERROR_CODES.PAGE_NOT_PUBLISHED, 'Halaman antrean ini sedang tidak aktif')
    }

    /**
     * Pagar lokasi diperiksa sebelum apa pun yang lain: permintaan dari luar
     * jangkauan tidak boleh sempat menyentuh pengaturan, formulir, apalagi antrean.
     */
    assertInsideGeofence(evaluateGeofence(page, params.visitor ?? null))

    // Pendaftaran mandiri bisa dimatikan menyeluruh dari pengaturan sistem (§49)
    const settings = await settingService.forEvent(page.event)
    if (!settings[SETTING_KEYS.QUEUE_PUBLIC_REGISTRATION]) {
      throw errors.badRequest(
        ERROR_CODES.REGISTRATION_DISABLED,
        'Pengambilan nomor mandiri sedang dinonaktifkan. Silakan hubungi petugas.',
      )
    }

    // Anti-bot (§36) — diperiksa sebelum apa pun menyentuh database
    if (page.requireCaptcha) {
      await verifyCaptcha(params.captchaToken, params.ipAddress)
    }

    /**
     * Captcha geser, dinyalakan per formulir di /admin/forms.
     *
     * Kuerinya sengaja hanya mengambil satu kolom: pemeriksaan anti-bot berdiri
     * paling depan, jadi permintaan dari skrip tidak boleh sempat menarik seluruh
     * definisi formulir beserta field-nya.
     */
    const gerbang = await prisma.formDefinition.findFirst({
      where: { eventId: page.eventId, isActive: true },
      orderBy: { createdAt: 'desc' },
      select: { requireCaptcha: true },
    })
    if (gerbang?.requireCaptcha) {
      consumeTicket(params.sliderToken, 'queue', params.ipAddress ?? 'unknown')
    }

    // Event harus benar-benar sedang melayani
    await eventService.assertAcceptsNewQueue(page.eventId)

    const allowed = Array.isArray(page.allowedQueueTypeIds) ? (page.allowedQueueTypeIds as string[]) : []
    if (allowed.length && !allowed.includes(params.queueTypeId)) {
      throw errors.badRequest(ERROR_CODES.QUEUE_TYPE_UNAVAILABLE, 'Layanan ini tidak tersedia pada halaman tersebut')
    }

    // Batas pengambilan per IP per hari — rem tambahan di atas rate limit (§36)
    if (page.maxPerIpPerDay > 0 && params.ipAddress) {
      const serviceDate = resolveServiceDate(page.event.timezone)
      const taken = await prisma.queue.count({
        where: {
          eventId: page.eventId,
          serviceDate,
          deletedAt: null,
          visitor: { ipAddress: params.ipAddress },
        },
      })
      if (taken >= page.maxPerIpPerDay) {
        throw errors.badRequest(
          ERROR_CODES.DAILY_LIMIT_REACHED,
          `Perangkat ini sudah mengambil ${taken} antrean hari ini`,
        )
      }
    }

    // Validasi jawaban terhadap definisi form aktif
    const form = await prisma.formDefinition.findFirst({
      where: { eventId: page.eventId, isActive: true },
      orderBy: { createdAt: 'desc' },
      include: { fields: { orderBy: { displayOrder: 'asc' } } },
    })

    let values: Record<string, unknown> = {}
    let fieldValues: Array<{ formFieldId: string | null, fieldKey: string, value: unknown, type?: string }> = []

    if (form?.fields.length) {
      values = buildFormValidator(form.fields).parse(params.values ?? {}) as Record<string, unknown>
      fieldValues = form.fields
        .filter(f => values[f.key] !== undefined && values[f.key] !== null && values[f.key] !== '')
        .map(f => ({ formFieldId: f.id, fieldKey: f.key, value: values[f.key], type: f.type }))
    }

    const core = extractVisitorCore(values)

    const queue = await queueService.create({
      eventId: page.eventId,
      queueTypeId: params.queueTypeId,
      source: 'PUBLIC',
      visitor: {
        ...core,
        data: values,
        fieldValues,
        ipAddress: params.ipAddress ?? null,
        userAgent: params.userAgent ?? null,
      },
    })

    return queue
  },
}
