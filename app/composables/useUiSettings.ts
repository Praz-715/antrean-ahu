import {
  API_LOADING_STYLES,
  ROUTE_LOADING_STYLES,
  SKELETON_STYLES,
  type ApiLoadingStyle,
  type RouteLoadingStyle,
  type SkeletonStyle,
} from '#shared/constants/settings'

export interface UiSettings {
  loadingRoute: RouteLoadingStyle
  loadingApi: ApiLoadingStyle
  loadingSkeleton: SkeletonStyle
}

/** Perilaku sebelum pengaturan ini ada; juga jawaban saat pemuatannya gagal. */
export const UI_SETTINGS_BAWAAN: UiSettings = {
  loadingRoute: 'bar',
  loadingApi: 'bar',
  loadingSkeleton: 'pulse',
}

/**
 * Pilihan tampilan yang berlaku untuk seluruh aplikasi.
 *
 * `useState`, bukan state tingkat modul: nilainya diisi saat SSR oleh
 * `plugins/ui-settings.ts` lalu ikut terbawa ke klien lewat payload. Tanpa itu
 * klien harus memintanya sendiri setelah hidrasi, dan indikator memuat sempat
 * tergambar dengan gaya yang salah lebih dulu — persis pada pemuatan pertama,
 * satu-satunya saat indikator itu pasti terlihat.
 */
export function useUiSettings() {
  return useState<UiSettings>('antrean:ui-settings', () => ({ ...UI_SETTINGS_BAWAAN }))
}

/**
 * Saring nilai asing menjadi nilai bawaan.
 *
 * Baris pengaturan bisa disunting langsung di basis data, dan gaya yang tidak
 * dikenal membuat komponen indikator tidak menggambar apa pun — memuat tanpa
 * tanda sama sekali, kegagalan yang paling sulit disadari. Server sudah
 * menyaringnya; di sini disaring ulang karena payload SSR juga bisa berasal dari
 * versi server yang lebih tua saat penerapan berjalan bertahap.
 */
export function normalizeUiSettings(raw: unknown): UiSettings {
  const src = (raw ?? {}) as Record<string, unknown>
  const pilih = <T extends string>(v: unknown, sah: readonly T[], bawaan: T): T =>
    sah.includes(String(v) as T) ? (String(v) as T) : bawaan

  return {
    loadingRoute: pilih(src.loadingRoute, ROUTE_LOADING_STYLES, UI_SETTINGS_BAWAAN.loadingRoute),
    loadingApi: pilih(src.loadingApi, API_LOADING_STYLES, UI_SETTINGS_BAWAAN.loadingApi),
    loadingSkeleton: pilih(src.loadingSkeleton, SKELETON_STYLES, UI_SETTINGS_BAWAAN.loadingSkeleton),
  }
}
