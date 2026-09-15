import { z } from 'zod'
import { defineApiHandler } from '../../../utils/handler'
import { errors } from '../../../utils/response'
import { prisma } from '../../../utils/prisma'
import { settingService } from '../../../services/setting.service'
import { safeFetchBinary } from '../../../utils/ssrf'
import { GOOGLE_TTS_HEADERS, googleTranslateTtsUrl } from '../../../utils/google-translate-tts'
import { SETTING_KEYS } from '../../../../shared/constants/settings'
import { ERROR_CODES } from '../../../../shared/constants/errors'

/**
 * Suara panggilan dari layanan TTS di luar perangkat (§22).
 *
 * Dua sumber lewat satu pintu: mesin Google Translate (gratis, tanpa kunci) dan
 * layanan TTS milik sendiri yang alamatnya ditulis admin.
 *
 * Layar TIDAK memanggil layanan TTS-nya langsung, melainkan lewat endpoint ini.
 * Tiga alasannya:
 *  - URL layanan sering memuat kunci API; kalau dipanggil dari peramban, kuncinya
 *    ikut terbaca siapa pun yang membuka layar itu;
 *  - CSP aplikasi ini hanya mengizinkan koneksi ke origin sendiri, dan melonggarkannya
 *    demi satu fitur berarti melonggarkannya untuk semua halaman;
 *  - permintaan keluar jadi melewati penjaga SSRF yang sama dengan sumber data lain.
 *
 * Tidak butuh login: perangkat display memang menyajikan layar publik, sama seperti
 * endpoint state-nya. Yang dibatasi adalah panjang teks dan ukuran jawaban.
 */
const querySchema = z.object({
  text: z.string().trim().min(1).max(200),
})

/** Cukup untuk satu kalimat panggilan; lebih dari ini bukan lagi TTS panggilan. */
const MAX_AUDIO_BYTES = 2 * 1024 * 1024

export default defineApiHandler(async (event) => {
  const deviceCode = getRouterParam(event, 'deviceCode') as string
  const { text } = querySchema.parse(getQuery(event))

  const device = await prisma.displayDevice.findFirst({
    where: { deviceCode, deletedAt: null },
    select: {
      event: { select: { organizationId: true, settings: true } },
    },
  })
  if (!device) throw errors.notFound('Perangkat display tidak ditemukan')

  const settings = await settingService.forEvent(device.event)

  const provider = String(settings[SETTING_KEYS.DISPLAY_VOICE_PROVIDER])
  if (provider !== 'external' && provider !== 'gtranslate') {
    throw errors.badRequest(
      ERROR_CODES.VALIDATION_ERROR,
      'Sumber suara event ini tidak memakai layanan TTS',
    )
  }

  const language = String(settings[SETTING_KEYS.DISPLAY_VOICE_LANGUAGE] ?? 'id-ID')

  let target: string
  let headers: Record<string, string> | undefined

  if (provider === 'gtranslate') {
    target = googleTranslateTtsUrl(text, language)
    headers = GOOGLE_TTS_HEADERS
  }
  else {
    const template = String(settings[SETTING_KEYS.DISPLAY_VOICE_EXTERNAL_URL] ?? '').trim()
    if (!template.includes('{text}')) {
      throw errors.badRequest(
        ERROR_CODES.VALIDATION_ERROR,
        'URL TTS eksternal belum diisi atau tidak memuat penanda {text}',
      )
    }

    target = template
      .replaceAll('{text}', encodeURIComponent(text))
      .replaceAll('{lang}', encodeURIComponent(language))
  }

  const response = await safeFetchBinary(target, { timeoutMs: 8000, maxBytes: MAX_AUDIO_BYTES, headers })
  if (!response.ok) {
    throw errors.badRequest(
      ERROR_CODES.DATA_SOURCE_UNREACHABLE,
      provider === 'gtranslate'
        ? `Google Translate menjawab HTTP ${response.status}`
        : `Layanan TTS menjawab HTTP ${response.status}`,
    )
  }

  /**
   * Jawaban yang bukan audio ditolak, bukan diteruskan. Endpoint ini boleh diakses
   * tanpa login, jadi tidak boleh berubah jadi proxy serbaguna yang meneruskan
   * halaman HTML atau JSON apa pun dari internet.
   */
  const contentType = response.contentType.split(';')[0]!.trim().toLowerCase()
  if (!contentType.startsWith('audio/')) {
    throw errors.badRequest(
      ERROR_CODES.DATA_SOURCE_UNREACHABLE,
      `Layanan TTS mengembalikan ${contentType || 'tipe tidak dikenal'}, bukan audio`,
    )
  }

  setResponseHeaders(event, {
    'Content-Type': contentType,
    'Content-Length': String(response.bytes.byteLength),
    // Suara panggilan berubah tiap nomor; jangan sampai tersimpan di cache bersama.
    'Cache-Control': 'no-store',
  })
  return response.bytes
})
