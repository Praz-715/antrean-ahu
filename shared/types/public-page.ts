import type { PublicPageTheme } from '../schemas/public-page'

/**
 * Bentuk data yang dibutuhkan perender halaman publik.
 *
 * Sengaja hidup di `shared/`: halaman pengunjung mengisinya dari API, sedangkan
 * pratinjau di builder menyusunnya dari isian yang sedang diketik admin. Selama
 * keduanya memenuhi bentuk yang sama, keduanya menghasilkan tampilan yang sama —
 * itulah satu-satunya cara menjaga pratinjau tetap jujur.
 */

/** Satu field formulir pengunjung, apa adanya dari definisi formulir aktif. */
export interface PublicFormFieldDef {
  id: string
  key: string
  label: string
  type: string
  placeholder: string | null
  helpText: string | null
  isRequired: boolean
  defaultValue: string | null
  options: unknown
  validation: unknown
}

export interface PublicServiceView {
  id: string
  code: string
  name: string
  description: string | null
  color: string
  icon: string | null
  waitingCount: number
  estServiceSeconds: number
}

export interface PublicOpenState {
  isOpen: boolean
  acceptsNewQueue: boolean
  message: string
  openTime: string | null
  closeTime: string | null
  serviceDate: string
}

export interface PublicPageView {
  page: {
    title: string
    subtitle: string | null
    description: string | null
    logoUrl: string | null
    backgroundUrl: string | null
    infoHtml: string | null
    theme: PublicPageTheme
  }
  organization: { name: string, logoUrl: string | null } | null
  event: {
    name: string
    startDate?: string | null
    endDate?: string | null
  }
  openState: PublicOpenState
  queueTypes: PublicServiceView[]
  features: { publicRegistration: boolean }
}

/** Nomor yang sudah dipegang pengunjung, per layanan. */
export interface PublicTicketView {
  token: string
  queueNumber: string
  status: string
  ahead: number
  nowServing: string | null
}

/** Lebar pratinjau di builder halaman publik. */
export type PreviewDevice = 'desktop' | 'tablet' | 'mobile'

/**
 * Isian builder halaman publik — bentuk yang sama dengan yang dikirim ke API.
 *
 * Dipakai bersama halaman builder dan panel setelannya, supaya keduanya tidak
 * mendefinisikan bentuk yang sama dua kali lalu pelan-pelan berbeda.
 */
export interface PublicPageDraft {
  title: string
  subtitle: string
  description: string
  slug: string
  infoHtml: string
  logoUrl: string
  backgroundUrl: string
  allowedQueueTypeIds: string[]
  maxPerIpPerDay: number
  requireCaptcha: boolean
  /** Pagar lokasi (§36) — aturan akses, bukan tampilan, jadi di luar `theme`. */
  geofenceEnabled: boolean
  latitude: number | null
  longitude: number | null
  geofenceRadiusM: number
  theme: PublicPageTheme
}
