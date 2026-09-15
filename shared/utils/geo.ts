/**
 * Perhitungan jarak untuk pagar lokasi halaman publik (§36).
 *
 * Dipakai bersama: server memutuskan boleh-tidaknya halaman dibuka, dan klien
 * menampilkan "Anda ±3,4 km dari lokasi" pada layar penolakan. Keduanya harus
 * memakai rumus yang sama persis, kalau tidak pengunjung bisa membaca jarak yang
 * berbeda dari yang dipakai memutuskan.
 */

const RADIUS_BUMI_M = 6_371_000

const rad = (derajat: number) => (derajat * Math.PI) / 180

/**
 * Jarak dua titik di permukaan bumi, dalam meter (haversine).
 *
 * Bumi diperlakukan sebagai bola sempurna. Pada jarak sepagar lokasi — ratusan meter
 * sampai beberapa kilometer — selisihnya terhadap perhitungan elipsoid jauh di bawah
 * ketelitian GPS ponsel itu sendiri, jadi tidak ada gunanya memakai rumus yang lebih
 * berat.
 */
export function distanceMeters(
  a: { latitude: number, longitude: number },
  b: { latitude: number, longitude: number },
): number {
  const dLat = rad(b.latitude - a.latitude)
  const dLng = rad(b.longitude - a.longitude)
  const s = Math.sin(dLat / 2) ** 2
    + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLng / 2) ** 2
  return 2 * RADIUS_BUMI_M * Math.asin(Math.min(1, Math.sqrt(s)))
}

export function isValidLatitude(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= -90 && value <= 90
}

export function isValidLongitude(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= -180 && value <= 180
}

export interface Coordinates { latitude: number, longitude: number }

/**
 * Membaca koordinat dari apa pun yang biasa ditempel admin.
 *
 * Yang diterima: "-6.2, 106.8", tautan Google Maps (`.../@-6.2,106.8,17z`,
 * `?q=-6.2,106.8`, `!3d-6.2!4d106.8`), dan tautan pendek yang sudah dibuka penuh.
 * Menyuruh admin menggali angka sendiri dari URL panjang adalah cara tercepat
 * mendapatkan titik yang salah ketik.
 */
export function parseCoordinates(input: string): Coordinates | null {
  const teks = input.trim()
  if (!teks) return null

  const kandidat: Array<[string, string]> = []

  // Bentuk paling sederhana: sepasang angka dipisah koma
  const pasangan = teks.match(/^\s*(-?\d{1,3}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/)
  if (pasangan) kandidat.push([pasangan[1]!, pasangan[2]!])

  // Titik yang sedang dilihat pada peta Google: /@lat,lng,zoom
  const at = teks.match(/@(-?\d{1,3}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)/)
  if (at) kandidat.push([at[1]!, at[2]!])

  // Pin sesungguhnya pada tautan Google Maps: !3dlat!4dlng
  const pin = teks.match(/!3d(-?\d{1,3}(?:\.\d+)?)!4d(-?\d{1,3}(?:\.\d+)?)/)
  if (pin) kandidat.unshift([pin[1]!, pin[2]!])

  // Parameter kueri: ?q=lat,lng atau ?query=lat,lng atau ?ll=lat,lng
  const q = teks.match(/[?&](?:q|query|ll|daddr)=(-?\d{1,3}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)/)
  if (q) kandidat.push([q[1]!, q[2]!])

  for (const [lat, lng] of kandidat) {
    const latitude = Number(lat)
    const longitude = Number(lng)
    if (isValidLatitude(latitude) && isValidLongitude(longitude)) return { latitude, longitude }
  }
  return null
}

/** "850 m" atau "3,4 km" — jarak untuk dibaca orang, bukan untuk dihitung. */
export function formatDistance(meters: number): string {
  if (!Number.isFinite(meters)) return '—'
  if (meters < 1000) return `${Math.round(meters)} m`
  return `${(meters / 1000).toFixed(1).replace('.', ',')} km`
}

/** Tautan peta untuk satu titik; dipakai layar penolakan dan pratinjau di builder. */
export function mapsUrl(point: Coordinates): string {
  return `https://www.google.com/maps/search/?api=1&query=${point.latitude},${point.longitude}`
}
