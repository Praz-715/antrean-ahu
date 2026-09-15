import { describe, expect, it } from 'vitest'
import { distanceMeters, formatDistance, parseCoordinates } from '../../shared/utils/geo'
import { coordsOf, evaluateGeofence, visitorCoordsSchema } from '../../server/utils/geofence'

const MONAS = { latitude: -6.175392, longitude: 106.827153 }

describe('jarak', () => {
  it('nol untuk titik yang sama', () => {
    expect(Math.round(distanceMeters(MONAS, MONAS))).toBe(0)
  })

  it('sesuai jarak sebenarnya Monas–Kota Tua (±4,5 km)', () => {
    const kotaTua = { latitude: -6.1352, longitude: 106.8133 }
    const m = distanceMeters(MONAS, kotaTua)
    expect(m).toBeGreaterThan(4000)
    expect(m).toBeLessThan(5200)
  })

  it('simetris', () => {
    const b = { latitude: -6.2, longitude: 106.9 }
    expect(Math.round(distanceMeters(MONAS, b))).toBe(Math.round(distanceMeters(b, MONAS)))
  })
})

describe('membaca koordinat yang ditempel admin', () => {
  it('sepasang angka', () => {
    expect(parseCoordinates('-6.2088, 106.8456')).toEqual({ latitude: -6.2088, longitude: 106.8456 })
    expect(parseCoordinates('-6.2088,106.8456')).toEqual({ latitude: -6.2088, longitude: 106.8456 })
  })

  it('tautan Google Maps', () => {
    expect(parseCoordinates('https://www.google.com/maps/@-6.175392,106.827153,17z'))
      .toEqual({ latitude: -6.175392, longitude: 106.827153 })
    expect(parseCoordinates('https://maps.google.com/?q=-6.2,106.8'))
      .toEqual({ latitude: -6.2, longitude: 106.8 })
  })

  it('mendahulukan pin sesungguhnya daripada titik pandang peta', () => {
    // !3d/!4d adalah pin-nya; @... hanya posisi kamera saat tautan disalin.
    const url = 'https://www.google.com/maps/place/X/@-6.100000,106.100000,17z/data=!3m1!4b1!3d-6.200000!4d106.200000'
    expect(parseCoordinates(url)).toEqual({ latitude: -6.2, longitude: 106.2 })
  })

  it('menolak yang bukan koordinat', () => {
    expect(parseCoordinates('gedung A lantai 2')).toBeNull()
    expect(parseCoordinates('')).toBeNull()
    expect(parseCoordinates('999, 999')).toBeNull()
  })
})

describe('pagar lokasi', () => {
  const pagar = { geofenceEnabled: true, latitude: MONAS.latitude, longitude: MONAS.longitude, geofenceRadiusM: 1000 }

  it('meloloskan pengunjung di dalam radius', () => {
    const hasil = evaluateGeofence(pagar, { latitude: -6.176, longitude: 106.828 })
    expect(hasil.inside).toBe(true)
    expect(hasil.required).toBe(true)
    expect(hasil.distanceM).toBeLessThan(1000)
  })

  it('menolak pengunjung di luar radius dan memberi tahu jaraknya', () => {
    const hasil = evaluateGeofence(pagar, { latitude: -6.3, longitude: 106.9 })
    expect(hasil.inside).toBe(false)
    expect(hasil.distanceM).toBeGreaterThan(1000)
  })

  it('menolak selama lokasi belum diberikan', () => {
    const hasil = evaluateGeofence(pagar, null)
    expect(hasil.inside).toBe(false)
    expect(hasil.distanceM).toBeNull()
    // Titik pusat tetap dibagikan supaya pengunjung tahu harus ke mana.
    expect(hasil.latitude).toBe(MONAS.latitude)
  })

  it('dianggap mati bila pagarnya menyala tanpa titik koordinat', () => {
    // Keadaan setengah jadi tidak boleh mengunci halaman yang sudah terbit.
    const hasil = evaluateGeofence({ ...pagar, latitude: null, longitude: null }, null)
    expect(hasil.required).toBe(false)
    expect(hasil.inside).toBe(true)
  })

  it('membiarkan halaman tanpa pagar terbuka tanpa koordinat', () => {
    const hasil = evaluateGeofence({ ...pagar, geofenceEnabled: false }, null)
    expect(hasil.required).toBe(false)
    expect(hasil.inside).toBe(true)
  })
})

describe('jarak untuk dibaca orang', () => {
  it('meter di bawah satu kilometer, kilometer di atasnya', () => {
    expect(formatDistance(850)).toBe('850 m')
    expect(formatDistance(1000)).toBe('1,0 km')
    expect(formatDistance(3412)).toBe('3,4 km')
  })
})

describe('koordinat yang dikirim pengunjung', () => {
  const baca = (raw: unknown) => coordsOf(visitorCoordsSchema.parse(raw))

  it('membaca angka maupun teks angka', () => {
    expect(baca({ lat: -6.2, lng: 106.8 })).toEqual({ latitude: -6.2, longitude: 106.8 })
    expect(baca({ lat: '-6.2', lng: '106.8' })).toEqual({ latitude: -6.2, longitude: 106.8 })
  })

  /**
   * Ini alamat yang dibuka pengunjung: penanda buku basi atau tautan tersalin
   * sebagian harus kembali ke layar verifikasi, bukan menghasilkan galat mentah.
   */
  it('memperlakukan nilai ngawur sebagai tidak ada lokasi', () => {
    expect(baca({ lat: 999, lng: 'abc' })).toBeNull()
    expect(baca({ lat: 'entah', lng: 'apa' })).toBeNull()
    expect(baca({})).toBeNull()
  })

  it('setengah koordinat tetap dianggap tidak ada', () => {
    expect(baca({ lat: -6.2 })).toBeNull()
    expect(baca({ lng: 106.8 })).toBeNull()
  })
})
