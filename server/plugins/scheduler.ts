import { schedulerService } from '../services/scheduler.service'
import { createLogger } from '../utils/logger'

const log = createLogger('scheduler')

/** Selang pemeriksaan jadwal. Satu menit sudah cukup halus untuk jam buka-tutup. */
const INTERVAL_MS = 60_000

/**
 * Penjadwal buka/tutup event otomatis (§10).
 *
 * Berjalan di dalam proses Nitro, bukan sebagai cron sistem, supaya `npm run dev`
 * dan satu kontainer produksi sama-sama langsung bekerja tanpa pemasangan tambahan.
 *
 * CATATAN SKALA: penjadwal ini in-process. Bila nanti aplikasi dijalankan lebih dari
 * satu instance, jalankan hanya satu di antaranya dengan SCHEDULER_ENABLED=false pada
 * sisanya — kalau tidak, setiap instance akan menulis perubahan status yang sama.
 */
export default defineNitroPlugin((nitroApp) => {
  if (process.env.SCHEDULER_ENABLED === 'false' || process.env.NODE_ENV === 'test') {
    log.info('penjadwal dimatikan lewat konfigurasi')
    return
  }

  let running = false

  const tick = async () => {
    // Satu putaran yang lambat tidak boleh menumpuk putaran berikutnya.
    if (running) return
    running = true
    try {
      await schedulerService.runOnce()
    }
    catch (error) {
      log.error('putaran penjadwal gagal', { message: (error as Error).message })
    }
    finally {
      running = false
    }
  }

  const timer = setInterval(tick, INTERVAL_MS)
  // Jangan menahan proses tetap hidup hanya demi penjadwal.
  timer.unref?.()

  // Putaran pertama ditunda sebentar supaya tidak beradu dengan proses startup.
  const warmup = setTimeout(tick, 5_000)
  warmup.unref?.()

  nitroApp.hooks.hook('close', () => {
    clearInterval(timer)
    clearTimeout(warmup)
  })

  log.info(`penjadwal aktif, memeriksa jadwal tiap ${INTERVAL_MS / 1000} detik`)
})
