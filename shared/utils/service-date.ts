/**
 * Tanggal layanan untuk sisi klien.
 *
 * `new Date().toISOString().slice(0, 10)` memberi tanggal UTC — untuk WIB itu keliru
 * satu hari setiap pukul 17.00–24.00 WIB. Filter tanggal dan laporan harus mengikuti
 * zona waktu EVENT, sama seperti perhitungan `service_date` di server (§50).
 */
export function todayInTimezone(timezone = 'Asia/Jakarta'): string {
  // 'en-CA' menghasilkan format YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

/**
 * Rentang tanggal event dalam bahasa Indonesia, mis. "12 – 16 September 2026".
 *
 * Bagian yang sama tidak diulang: bulan dan tahun hanya ditulis sekali bila kedua
 * tanggalnya masih dalam bulan yang sama — sebaris "12 September 2026 – 16 September
 * 2026" memakan dua baris di ponsel tanpa menambah informasi apa pun.
 */
export function formatDateRange(start?: string | null, end?: string | null): string {
  if (!start && !end) return ''

  const awal = start ?? end!
  const akhir = end ?? start!

  const tanggal = (v: string) => new Date(`${v}T00:00:00.000Z`)
  const fmt = (v: string, opts: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat('id-ID', { timeZone: 'UTC', ...opts }).format(tanggal(v))

  if (awal === akhir) return fmt(awal, { day: 'numeric', month: 'long', year: 'numeric' })

  const bulanSama = awal.slice(0, 7) === akhir.slice(0, 7)
  const tahunSama = awal.slice(0, 4) === akhir.slice(0, 4)

  if (bulanSama) {
    return `${fmt(awal, { day: 'numeric' })} – ${fmt(akhir, { day: 'numeric', month: 'long', year: 'numeric' })}`
  }
  if (tahunSama) {
    return `${fmt(awal, { day: 'numeric', month: 'long' })} – ${fmt(akhir, { day: 'numeric', month: 'long', year: 'numeric' })}`
  }
  return `${fmt(awal, { day: 'numeric', month: 'long', year: 'numeric' })} – ${fmt(akhir, { day: 'numeric', month: 'long', year: 'numeric' })}`
}

/** Geser tanggal 'YYYY-MM-DD' sekian hari, tanpa terpengaruh zona waktu peramban. */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
