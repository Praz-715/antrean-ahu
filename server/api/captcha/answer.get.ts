import { z } from 'zod'
import { defineApiHandler } from '../../utils/handler'
import { errors, ok } from '../../utils/response'
import { ERROR_CODES } from '../../../shared/constants/errors'
import { createLogger } from '../../utils/logger'
import { isAnswerRevealAllowed, revealTarget } from '../../utils/slider-captcha'

const log = createLogger('captcha-geser')

const querySchema = z.object({ id: z.string().min(1).max(64) })

/**
 * Membuka jawaban satu teka-teki — HANYA untuk uji otomatis.
 *
 * Tidak ada di pemasangan biasa: tanpa `CAPTCHA_DEV_BYPASS=1` pada lingkungan
 * non-produksi, endpoint ini menjawab 404 seperti alamat yang tidak dikenal, jadi
 * keberadaannya pun tidak bisa diendus.
 *
 * Yang dibuka hanya posisinya. Uji tetap harus mengirim jawaban ke endpoint
 * verifikasi yang sama dengan pengguna sungguhan, lengkap dengan durasi dan jumlah
 * gerakan yang wajar — jadi jalur yang diuji tetap jalur yang dipakai di produksi.
 */
export default defineApiHandler(async (event) => {
  if (!isAnswerRevealAllowed()) {
    throw errors.notFound('Halaman tidak ditemukan')
  }

  const { id } = querySchema.parse(getQuery(event))
  const x = revealTarget(id)
  if (x === undefined) {
    throw errors.badRequest(ERROR_CODES.CAPTCHA_INVALID, 'Teka-teki tidak ditemukan atau sudah kedaluwarsa')
  }

  log.warn('jawaban teka-teki dibuka untuk uji otomatis', { id })
  setResponseHeader(event, 'Cache-Control', 'no-store')

  return ok({ x })
})
