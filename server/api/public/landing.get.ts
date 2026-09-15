import { defineApiHandler } from '../../utils/handler'
import { ok } from '../../utils/response'
import { prisma } from '../../utils/prisma'
import { settingService } from '../../services/setting.service'
import { eventService } from '../../services/event.service'
import { parsePublicPageTheme } from '../../../shared/schemas/public-page'
import { SETTING_KEYS, parseLanding } from '../../../shared/constants/settings'

/** Sebanyak-banyaknya halaman yang ditampilkan sebagai kartu. */
const BATAS = 24

/**
 * Isi halaman pangkal (`/`) menurut pengaturan sistem.
 *
 * Terbuka tanpa autentikasi — inilah alamat yang diketik orang ketika tidak memegang
 * tautan maupun QR. Endpoint-nya mengembalikan KEPUTUSAN, bukan pengaturan mentah:
 * klien tidak perlu tahu bentuk nilai `system.landing`, cukup mengikuti `redirect`
 * atau menggambar `pages`.
 *
 * Bila event yang dipilih ternyata sudah dihapus atau halamannya ditarik dari
 * publikasi, jawabannya kembali ke `none`. Mengalihkan pengunjung ke halaman yang
 * sengaja ditutup lebih buruk daripada menampilkan halaman sambutan.
 */
export default defineApiHandler(async (event) => {
  /**
   * Pemasangan ini satu organisasi. Halaman pangkal tidak punya kode publikasi yang
   * bisa dipakai menentukan pemiliknya, jadi yang dipakai organisasi pertama.
   */
  const organization = await prisma.organization.findFirst({
    where: { deletedAt: null },
    orderBy: { createdAt: 'asc' },
    select: { id: true, name: true, logoUrl: true },
  })

  const kosong = { mode: 'none' as const, redirect: null, organization: null, pages: [] }
  if (!organization) return ok(kosong)

  const settings = await settingService.getAll(organization.id)
  const { mode, eventId } = parseLanding(settings[SETTING_KEYS.SYSTEM_LANDING])

  setResponseHeader(event, 'Cache-Control', 'no-store')

  if (mode === 'none') return ok({ ...kosong, organization })

  const pages = await prisma.publicPage.findMany({
    where: {
      deletedAt: null,
      isPublished: true,
      event: { organizationId: organization.id, deletedAt: null, ...(eventId ? { id: eventId } : {}) },
    },
    orderBy: [{ createdAt: 'desc' }],
    take: BATAS,
    select: {
      publishCode: true,
      title: true,
      subtitle: true,
      logoUrl: true,
      backgroundUrl: true,
      theme: true,
      event: { select: { id: true, name: true } },
    },
  })

  // Event terpilih sudah tidak punya halaman terbit — kembali ke halaman sambutan.
  if (!pages.length) return ok({ ...kosong, organization })

  if (mode === 'event') {
    return ok({ mode: 'event' as const, redirect: `/p/${pages[0]!.publishCode}`, organization, pages: [] })
  }

  /**
   * Status buka ikut dikirim: pertanyaan pertama pengunjung yang melihat beberapa
   * layanan sekaligus adalah "mana yang buka sekarang", dan tanpa itu ia harus
   * membuka satu per satu untuk mencari tahu.
   */
  const openStates = await Promise.all(
    [...new Set(pages.map(p => p.event.id))].map(async id => [id, await eventService.getOpenState(id)] as const),
  )
  const statusPerEvent = new Map(openStates)

  return ok({
    mode: 'directory' as const,
    redirect: null,
    organization,
    pages: pages.map((p) => {
      const theme = parsePublicPageTheme(p.theme)
      const status = statusPerEvent.get(p.event.id)
      return {
        publishCode: p.publishCode,
        title: p.title,
        subtitle: p.subtitle,
        logoUrl: p.logoUrl,
        backgroundUrl: p.backgroundUrl,
        primaryColor: theme.primaryColor,
        secondaryColor: theme.secondaryColor,
        eventName: p.event.name,
        isOpen: status?.isOpen ?? false,
        statusMessage: status?.message ?? '',
        openTime: status?.openTime ?? null,
        closeTime: status?.closeTime ?? null,
      }
    }),
  })
})
