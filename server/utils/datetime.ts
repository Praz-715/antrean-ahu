import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc.js'
import timezone from 'dayjs/plugin/timezone.js'
import customParseFormat from 'dayjs/plugin/customParseFormat.js'
import isSameOrAfter from 'dayjs/plugin/isSameOrAfter.js'
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore.js'

dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.extend(customParseFormat)
dayjs.extend(isSameOrAfter)
dayjs.extend(isSameOrBefore)

export { dayjs }

export const DEFAULT_TIMEZONE = process.env.DEFAULT_TIMEZONE || 'Asia/Jakarta'

/**
 * Tanggal layanan (§8, §50): dihitung pada timezone EVENT, bukan timezone server.
 * Dikembalikan sebagai Date pada UTC midnight supaya cocok dengan kolom `@db.Date`.
 */
export function resolveServiceDate(tz: string = DEFAULT_TIMEZONE, at: Date = new Date()): Date {
  const localDate = dayjs(at).tz(tz).format('YYYY-MM-DD')
  return new Date(`${localDate}T00:00:00.000Z`)
}

/** 'YYYY-MM-DD' pada timezone tertentu. */
export function serviceDateString(tz: string = DEFAULT_TIMEZONE, at: Date = new Date()): string {
  return dayjs(at).tz(tz).format('YYYY-MM-DD')
}

/** Ubah Date kolom `@db.Date` menjadi 'YYYY-MM-DD' tanpa pergeseran timezone. */
export function formatServiceDate(date: Date): string {
  return dayjs(date).utc().format('YYYY-MM-DD')
}

/** Parse 'YYYY-MM-DD' menjadi Date UTC-midnight untuk kolom `@db.Date`. */
export function parseServiceDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`)
}

/** Menit sejak tengah malam untuk string 'HH:mm'. */
export function minutesOfDay(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

/** Waktu lokal saat ini pada timezone tertentu, dalam menit sejak tengah malam. */
export function nowMinutesInTz(tz: string = DEFAULT_TIMEZONE, at: Date = new Date()): number {
  const d = dayjs(at).tz(tz)
  return d.hour() * 60 + d.minute()
}

/** 0 = Minggu … 6 = Sabtu, pada timezone tertentu. */
export function dayOfWeekInTz(tz: string = DEFAULT_TIMEZONE, at: Date = new Date()): number {
  return dayjs(at).tz(tz).day()
}

export function secondsBetween(from: Date, to: Date = new Date()): number {
  return Math.max(0, Math.round((to.getTime() - from.getTime()) / 1000))
}

/**
 * Offset zona waktu dalam format '+07:00' untuk dipakai `CONVERT_TZ()` di MySQL.
 * Memakai offset eksplisit, bukan nama zona, supaya tidak bergantung pada tabel
 * `mysql.time_zone` yang biasanya kosong pada image Docker.
 */
export function tzOffsetString(tz: string = DEFAULT_TIMEZONE, at: Date = new Date()): string {
  const minutes = dayjs(at).tz(tz).utcOffset()
  const sign = minutes < 0 ? '-' : '+'
  const abs = Math.abs(minutes)
  const hh = String(Math.floor(abs / 60)).padStart(2, '0')
  const mm = String(abs % 60).padStart(2, '0')
  return `${sign}${hh}:${mm}`
}
