import { prisma } from '../utils/prisma'
import { storage } from '../utils/storage'
import { SETTING_KEYS } from '../../shared/constants/settings'

/**
 * Satu tempat yang sedang memegang sebuah berkas media.
 *
 * `jenis` menyebut fiturnya ("Logo jenis antrean"), `nama` menyebut barisnya
 * ("Direktorat Pidana"), supaya admin tahu ke mana harus pergi melepasnya —
 * pesan "masih dipakai" tanpa alamat hanya memindahkan kebingungan.
 */
export interface PemakaianMedia {
  jenis: string
  nama: string
}

/**
 * Cari semua pemakai dari sekumpulan berkas sekaligus.
 *
 * Ada dua cara media dirujuk di aplikasi ini, dan keduanya sama-sama membuat
 * berkasnya sedang dipakai:
 *
 *   1. LEWAT ID — widget display, item playlist, logo jenis antrean, dan
 *      pengaturan nada panggil menyimpan `media.id`.
 *   2. LEWAT URL — logo/latar halaman publik, branding event, latar template
 *      display, dan logo organisasi menyimpan hasil `storage.publicUrl()`
 *      sebagai teks, karena kolomnya juga menerima URL dari luar media library.
 *
 * Dikerjakan untuk banyak berkas sekaligus (satu kueri per sumber, bukan per
 * berkas) supaya daftar media yang panjang tidak berubah menjadi ratusan kueri.
 *
 * Baris yang sudah dihapus halus tidak ikut dihitung: event, halaman, template,
 * atau jenis antrean yang sudah di tempat sampah tidak boleh menyandera berkas.
 */
export async function petaPemakaianMedia(
  organizationId: string,
  berkas: Array<{ id: string, filePath: string }>,
): Promise<Map<string, PemakaianMedia[]>> {
  const peta = new Map<string, PemakaianMedia[]>(berkas.map(m => [m.id, []]))
  if (!berkas.length) return peta

  const ids = berkas.map(m => m.id)
  const perUrl = new Map(berkas.map(m => [storage.publicUrl(m.filePath), m.id]))

  function catat(mediaId: string | null | undefined, jenis: string, nama: string) {
    if (mediaId) peta.get(mediaId)?.push({ jenis, nama })
  }

  /**
   * Cocokkan URL tersimpan dengan berkas yang dikenal.
   *
   * Selain kecocokan persis, akhiran `filePath` ikut diperiksa: `STORAGE_PUBLIC_BASE`
   * bisa berubah setelah URL-nya tersimpan, dan URL lama tetap menunjuk berkas yang
   * sama — melewatkannya berarti mengizinkan penghapusan yang mematahkan gambar.
   */
  function catatUrl(url: string | null | undefined, jenis: string, nama: string) {
    if (!url) return
    const langsung = perUrl.get(url)
    if (langsung) return catat(langsung, jenis, nama)
    catat(berkas.find(m => url.endsWith(`/${m.filePath}`))?.id, jenis, nama)
  }

  const [widgets, itemPlaylist, jenisAntrean, setelan, events, halaman, template, organisasi] = await Promise.all([
    prisma.displayWidget.findMany({
      where: { mediaId: { in: ids }, template: { organizationId, deletedAt: null } },
      select: { mediaId: true, template: { select: { name: true } } },
    }),
    prisma.playlistItem.findMany({
      where: { mediaId: { in: ids }, playlist: { organizationId } },
      select: { mediaId: true, playlist: { select: { name: true } } },
    }),
    prisma.queueType.findMany({
      where: { logoMediaId: { in: ids }, deletedAt: null, event: { organizationId, deletedAt: null } },
      select: { logoMediaId: true, name: true },
    }),
    prisma.systemSetting.findMany({
      where: { organizationId, key: SETTING_KEYS.DISPLAY_VOICE_CHIME_MEDIA_ID },
      select: { value: true },
    }),
    prisma.event.findMany({
      where: { organizationId, deletedAt: null },
      select: { name: true, branding: true, settings: true },
    }),
    prisma.publicPage.findMany({
      where: { deletedAt: null, event: { organizationId, deletedAt: null } },
      select: { title: true, logoUrl: true, backgroundUrl: true },
    }),
    prisma.displayTemplate.findMany({
      where: { organizationId, deletedAt: null },
      select: { name: true, background: true },
    }),
    prisma.organization.findUnique({ where: { id: organizationId }, select: { name: true, logoUrl: true } }),
  ])

  for (const w of widgets) catat(w.mediaId, 'Widget display', w.template.name)
  for (const i of itemPlaylist) catat(i.mediaId, 'Item playlist', i.playlist.name)
  for (const q of jenisAntrean) catat(q.logoMediaId, 'Logo jenis antrean', q.name)

  for (const s of setelan) {
    const nilai = String(s.value ?? '')
    if (peta.has(nilai)) catat(nilai, 'Nada panggil', 'Pengaturan sistem')
  }

  for (const e of events) {
    const branding = (e.branding ?? {}) as { logoUrl?: string, backgroundUrl?: string }
    const setelanEvent = (e.settings ?? {}) as { voiceChimeMediaId?: string }
    catatUrl(branding.logoUrl, 'Logo event', e.name)
    catatUrl(branding.backgroundUrl, 'Latar event', e.name)
    const nada = String(setelanEvent.voiceChimeMediaId ?? '')
    if (peta.has(nada)) catat(nada, 'Nada panggil event', e.name)
  }

  for (const h of halaman) {
    catatUrl(h.logoUrl, 'Logo halaman publik', h.title)
    catatUrl(h.backgroundUrl, 'Latar halaman publik', h.title)
  }

  for (const t of template) {
    const latar = (t.background ?? {}) as { imageUrl?: string }
    catatUrl(latar.imageUrl, 'Latar template display', t.name)
  }

  catatUrl(organisasi?.logoUrl, 'Logo organisasi', organisasi?.name ?? 'Organisasi')

  return peta
}

/** Pemakai satu berkas; pintasan `petaPemakaianMedia` untuk satu anggota. */
export async function pemakaianMedia(organizationId: string, media: { id: string, filePath: string }) {
  return (await petaPemakaianMedia(organizationId, [media])).get(media.id) ?? []
}

/** Ringkas daftar pemakaian menjadi satu kalimat untuk pesan galat. */
export function ringkasPemakaian(pemakaian: PemakaianMedia[]) {
  return pemakaian.map(p => `${p.jenis} "${p.nama}"`).join(', ')
}
