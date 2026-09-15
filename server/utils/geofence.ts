import { z } from 'zod'
import { errors } from './response'
import { ERROR_CODES } from '../../shared/constants/errors'
import { distanceMeters, isValidLatitude, isValidLongitude } from '../../shared/utils/geo'

/**
 * Pagar lokasi halaman publik (§36).
 *
 * Halaman hanya terbuka bila pengunjung berada dalam radius tertentu dari titik yang
 * ditentukan admin. Diperiksa di SERVER pada tiap permintaan, bukan disembunyikan di
 * antarmuka: menyembunyikan tombol tidak menghalangi siapa pun memanggil API-nya
 * langsung.
 *
 * Yang perlu diketahui sebelum mengandalkannya: koordinat dikirim oleh peramban
 * pengunjung dan bisa dipalsukan (devtools, aplikasi GPS palsu). Pagar ini menaikkan
 * usaha yang dibutuhkan — sekelas captcha — bukan bukti keberadaan seseorang.
 */

export interface GeofenceConfig {
  geofenceEnabled: boolean
  latitude: number | null
  longitude: number | null
  geofenceRadiusM: number
}

export interface GeofenceState {
  /** Halaman ini memang dipagari — klien perlu meminta izin lokasi. */
  required: boolean
  /** Pengunjung boleh masuk. Selalu true bila pagarnya mati. */
  inside: boolean
  radiusM: number
  /** Titik pusat; dibagikan supaya layar penolakan bisa menunjukkan lokasinya. */
  latitude: number | null
  longitude: number | null
  /** Jarak pengunjung ke titik pusat; null bila lokasinya belum diberikan. */
  distanceM: number | null
}

/**
 * Koordinat pengunjung dari kueri (GET) maupun badan permintaan (POST).
 *
 * Nilai yang tidak masuk akal diperlakukan sebagai TIDAK ADA, bukan sebagai galat
 * validasi. Ini alamat yang dibuka pengunjung: penanda buku yang basi atau tautan
 * yang tersalin sebagian tidak boleh menghasilkan halaman galat mentah — yang benar
 * adalah kembali ke layar verifikasi lokasi, keadaan paling aman yang tersedia.
 */
export const visitorCoordsSchema = z.object({
  lat: z.coerce.number().min(-90).max(90).optional().catch(undefined),
  lng: z.coerce.number().min(-180).max(180).optional().catch(undefined),
})

export function coordsOf(input: { lat?: number, lng?: number }) {
  return isValidLatitude(input.lat) && isValidLongitude(input.lng)
    ? { latitude: input.lat, longitude: input.lng }
    : null
}

/**
 * Menilai satu permintaan terhadap pagar lokasi halamannya.
 *
 * Pagar yang menyala tanpa titik koordinat diperlakukan sebagai MATI, bukan sebagai
 * pagar yang menolak semua orang: keadaan itu hanya mungkin muncul dari data yang
 * setengah jadi, dan mengunci halaman yang sudah terbit karenanya jauh lebih merusak
 * daripada membiarkannya terbuka seperti sebelumnya.
 */
export function evaluateGeofence(
  page: GeofenceConfig,
  visitor: { latitude: number, longitude: number } | null,
): GeofenceState {
  const titikAda = isValidLatitude(page.latitude) && isValidLongitude(page.longitude)

  if (!page.geofenceEnabled || !titikAda) {
    return {
      required: false,
      inside: true,
      radiusM: page.geofenceRadiusM,
      latitude: titikAda ? page.latitude : null,
      longitude: titikAda ? page.longitude : null,
      distanceM: null,
    }
  }

  const pusat = { latitude: page.latitude as number, longitude: page.longitude as number }

  if (!visitor) {
    return { required: true, inside: false, radiusM: page.geofenceRadiusM, ...pusat, distanceM: null }
  }

  const distanceM = Math.round(distanceMeters(pusat, visitor))
  return {
    required: true,
    inside: distanceM <= page.geofenceRadiusM,
    radiusM: page.geofenceRadiusM,
    ...pusat,
    distanceM,
  }
}

/** Menolak aksi yang datang dari luar pagar. Dipakai jalur tulis dan jalur data. */
export function assertInsideGeofence(state: GeofenceState): void {
  if (state.inside) return

  throw errors.badRequest(
    ERROR_CODES.OUTSIDE_GEOFENCE,
    state.distanceM === null
      ? 'Halaman ini hanya bisa dibuka di lokasi layanan. Izinkan akses lokasi terlebih dahulu.'
      : 'Anda berada di luar jangkauan lokasi layanan.',
  )
}
