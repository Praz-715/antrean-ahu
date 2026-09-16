import { defineApiHandler } from '../../utils/handler'
import { ok } from '../../utils/response'
import { prisma } from '../../utils/prisma'
import { settingService } from '../../services/setting.service'
import {
  SETTING_KEYS,
  API_LOADING_STYLES,
  ROUTE_LOADING_STYLES,
  SKELETON_STYLES,
  type ApiLoadingStyle,
  type RouteLoadingStyle,
  type SkeletonStyle,
} from '../../../shared/constants/settings'

export interface PublicUiSettings {
  loadingRoute: RouteLoadingStyle
  loadingApi: ApiLoadingStyle
  loadingSkeleton: SkeletonStyle
}

/**
 * Pilihan tampilan yang dibutuhkan SEMUA halaman, termasuk yang tanpa sesi.
 *
 * Indikator memuat harus sudah benar sejak halaman masuk, halaman publik, layar
 * antrean, dan halaman tiket — tak satu pun punya sesi admin, jadi tidak bisa
 * membaca `/api/admin/settings` yang butuh izin `setting.view`. Endpoint ini
 * mengembalikan tiga nilai itu saja; sisa katalog pengaturan tetap tertutup.
 *
 * Dibaca sekali per pemuatan halaman lewat SSR, jadi biayanya satu query
 * organisasi ditambah pembacaan pengaturan yang sudah di-cache 30 detik di
 * `setting.service`.
 */
export default defineApiHandler(async (event) => {
  /**
   * Pemasangan ini satu organisasi — alasan yang sama dengan `landing.get.ts`:
   * halaman tanpa kode publikasi tidak punya petunjuk pemiliknya, jadi yang
   * dipakai organisasi pertama.
   */
  const organization = await prisma.organization.findFirst({
    where: { deletedAt: null },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  })

  setResponseHeader(event, 'Cache-Control', 'no-store')

  /**
   * Tanpa organisasi — pemasangan yang belum di-seed — nilai bawaannya yang dipakai,
   * bukan galat: halaman masuk harus tetap terbuka supaya ada jalan memperbaikinya.
   */
  if (!organization) {
    return ok<PublicUiSettings>({ loadingRoute: 'bar', loadingApi: 'bar', loadingSkeleton: 'pulse' })
  }

  const settings = await settingService.getAll(organization.id)

  /**
   * Nilainya dijaga ulang di sini meski `coerceSetting` sudah menjaganya saat
   * disimpan: baris pengaturan bisa disunting langsung di basis data, dan nilai
   * asing yang lolos ke klien membuat komponen indikator tidak menggambar apa pun
   * — memuat tanpa tanda sama sekali, kegagalan yang paling sulit disadari.
   */
  const pilih = <T extends string>(raw: unknown, sah: readonly T[], bawaan: T): T =>
    sah.includes(String(raw) as T) ? (String(raw) as T) : bawaan

  return ok<PublicUiSettings>({
    loadingRoute: pilih(settings[SETTING_KEYS.UI_LOADING_ROUTE], ROUTE_LOADING_STYLES, 'bar'),
    loadingApi: pilih(settings[SETTING_KEYS.UI_LOADING_API], API_LOADING_STYLES, 'bar'),
    loadingSkeleton: pilih(settings[SETTING_KEYS.UI_LOADING_SKELETON], SKELETON_STYLES, 'pulse'),
  })
})
