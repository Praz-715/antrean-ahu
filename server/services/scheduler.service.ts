import { prisma } from '../utils/prisma'
import { createLogger } from '../utils/logger'
import { dayOfWeekInTz, minutesOfDay, nowMinutesInTz, parseServiceDate, serviceDateString } from '../utils/datetime'
import { emitEventStatus } from '../realtime/emitters'
import { audit, AUDIT_ACTIONS } from '../utils/audit'
import { settingService } from './setting.service'
import { SETTING_KEYS } from '../../shared/constants/settings'

const log = createLogger('scheduler')

export interface SchedulerRunResult {
  checked: number
  opened: Array<{ eventId: string, name: string }>
  /** `status` menyebutkan hasil akhirnya: SCHEDULED (menunggu jadwal berikutnya) atau CLOSED. */
  closed: Array<{ eventId: string, name: string, status: 'SCHEDULED' | 'CLOSED' }>
  at: string
}

/**
 * Buka & tutup event secara otomatis mengikuti jadwalnya (§10).
 *
 * Di luar jam layanan, `getOpenState` memang sudah menolak antrean baru. Yang belum
 * terjadi tanpa job ini adalah statusnya IKUT berubah: layar tetap memasang tulisan
 * BUKA dan daftar event tetap hijau padahal loket sudah tutup sejam lalu. Job ini
 * menyelaraskan status tersimpan dengan jadwal sebenarnya.
 *
 * Sengaja idempoten: menjalankannya dua kali tidak mengubah apa pun pada kedua kali.
 */
export const schedulerService = {
  async runOnce(at: Date = new Date()): Promise<SchedulerRunResult> {
    const events = await prisma.event.findMany({
      where: { deletedAt: null, status: { in: ['OPEN', 'SCHEDULED'] } },
      select: {
        id: true,
        name: true,
        status: true,
        timezone: true,
        organizationId: true,
        settings: true,
        startDate: true,
        endDate: true,
        schedules: { select: { dayOfWeek: true, openTime: true, closeTime: true, isClosed: true, overrideDate: true } },
      },
    })

    const opened: SchedulerRunResult['opened'] = []
    const closed: SchedulerRunResult['closed'] = []

    for (const event of events) {
      const settings = await settingService.forEvent(event)
      if (!settings[SETTING_KEYS.QUEUE_AUTO_CLOSE]) continue

      const decision = decideStatus(event, at)
      if (!decision) continue

      await prisma.event.update({ where: { id: event.id }, data: { status: decision } })
      emitEventStatus(event.id, event.organizationId, decision)

      await audit(null, {
        organizationId: event.organizationId,
        userId: null, // dilakukan sistem, bukan seseorang
        action: decision === 'OPEN' ? AUDIT_ACTIONS.EVENT_OPENED : AUDIT_ACTIONS.EVENT_CLOSED,
        entity: 'Event',
        entityId: event.id,
        oldData: { status: event.status },
        newData: { status: decision, by: 'scheduler' },
      }).catch(() => {})

      if (decision === 'OPEN') opened.push({ eventId: event.id, name: event.name })
      else closed.push({ eventId: event.id, name: event.name, status: decision })
    }

    if (opened.length || closed.length) {
      log.info('status event diselaraskan dengan jadwal', { opened: opened.length, closed: closed.length })
    }

    return { checked: events.length, opened, closed, at: at.toISOString() }
  },
}

type SchedulableEvent = {
  status: string
  timezone: string
  startDate: Date | null
  endDate: Date | null
  schedules: Array<{ dayOfWeek: number, openTime: string, closeTime: string, isClosed: boolean, overrideDate: Date | null }>
}

/**
 * Status yang seharusnya berlaku sekarang, atau null bila sudah sesuai.
 *
 * Penutupan harian TIDAK memakai CLOSED, melainkan SCHEDULED — "sedang tidak
 * melayani, akan melayani lagi sesuai jadwal". Ini bukan soal rasa bahasa:
 * pembukaan otomatis hanya menyentuh event SCHEDULED, jadi kalau penutupan harian
 * menandainya CLOSED, layanan yang seharusnya berjalan tiap hari berhenti selamanya
 * setelah satu kali tutup dan harus dibuka manual setiap pagi.
 *
 * CLOSED disimpan untuk akhir yang sebenarnya: event yang sudah melewati tanggal
 * berakhirnya, atau yang memang ditutup admin (penjadwal tidak pernah menyentuh
 * event yang statusnya sudah CLOSED).
 */
function decideStatus(event: SchedulableEvent, at: Date): 'OPEN' | 'CLOSED' | 'SCHEDULED' | null {
  const tz = event.timezone
  const serviceDate = serviceDateString(tz, at)
  const today = parseServiceDate(serviceDate)

  // Belum masuk tanggal mulai: tutup sementara, tunggu jadwalnya.
  if (event.startDate && today < event.startDate) return event.status === 'OPEN' ? 'SCHEDULED' : null
  // Sudah melewati tanggal berakhir: ini benar-benar selesai.
  if (event.endDate && today > event.endDate) return event.status === 'OPEN' ? 'CLOSED' : null

  const override = event.schedules.find(s =>
    s.overrideDate && s.overrideDate.getTime() === today.getTime())
  const schedule = override
    ?? event.schedules.find(s => !s.overrideDate && s.dayOfWeek === dayOfWeekInTz(tz, at))

  // Hari ini tidak ada layanan (mis. Minggu) — tetap menunggu jadwal berikutnya.
  if (!schedule || schedule.isClosed) return event.status === 'OPEN' ? 'SCHEDULED' : null

  const now = nowMinutesInTz(tz, at)
  const open = minutesOfDay(schedule.openTime)
  const close = minutesOfDay(schedule.closeTime)

  /**
   * Penutupan hanya dilakukan SETELAH jam tutup, bukan sebelum jam buka: event yang
   * sengaja dibuka lebih awal oleh admin tidak boleh ditutup paksa beberapa menit
   * kemudian hanya karena jadwalnya belum mulai.
   *
   * Bila event masih punya hari layanan lain, statusnya kembali ke SCHEDULED supaya
   * besok dibuka sendiri; hanya event tanpa hari layanan lain yang benar-benar ditutup.
   */
  if (event.status === 'OPEN' && now >= close) {
    const todayDow = dayOfWeekInTz(tz, at)
    const hasOtherServiceDays = event.schedules.some(s =>
      !s.overrideDate && !s.isClosed && s.dayOfWeek !== todayDow)
    return hasOtherServiceDays ? 'SCHEDULED' : 'CLOSED'
  }

  if (event.status === 'SCHEDULED' && now >= open && now < close) return 'OPEN'

  return null
}
