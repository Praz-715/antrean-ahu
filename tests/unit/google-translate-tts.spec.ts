import { describe, expect, it } from 'vitest'
import { GOOGLE_TTS_MAX_CHARS, googleTranslateTtsUrl, googleTtsLang } from '../../server/utils/google-translate-tts'

describe('kode bahasa untuk Google Translate', () => {
  it('membuang bagian wilayah dari BCP-47', () => {
    expect(googleTtsLang('id-ID')).toBe('id')
    expect(googleTtsLang('en-US')).toBe('en')
  })

  it('menerima kode yang sudah pendek', () => {
    expect(googleTtsLang('id')).toBe('id')
  })

  it('jatuh ke Indonesia untuk nilai yang tidak masuk akal', () => {
    expect(googleTtsLang('')).toBe('id')
    expect(googleTtsLang('12345')).toBe('id')
  })
})

describe('URL suara Google Translate', () => {
  const teks = 'Nomor antrean, A 0 2 3, silakan menuju Loket 1.'

  it('menyusun alamat yang lengkap dan ter-escape', () => {
    const url = new URL(googleTranslateTtsUrl(teks, 'id-ID'))
    expect(url.origin + url.pathname).toBe('https://translate.google.com/translate_tts')
    expect(url.searchParams.get('q')).toBe(teks)
    expect(url.searchParams.get('tl')).toBe('id')
    expect(url.searchParams.get('textlen')).toBe(String(teks.length))
    // Klien lawas: satu-satunya yang tidak meminta token tanda tangan.
    expect(url.searchParams.get('client')).toBe('tw-ob')
  })

  it('menolak teks kosong', () => {
    expect(() => googleTranslateTtsUrl('   ', 'id-ID')).toThrow()
  })

  /** Batas dari Google; melewatinya menghasilkan audio terpotong tanpa peringatan. */
  it('menolak teks di atas batas Google', () => {
    expect(() => googleTranslateTtsUrl('a'.repeat(GOOGLE_TTS_MAX_CHARS + 1), 'id-ID')).toThrow(/melebihi batas/)
    expect(() => googleTranslateTtsUrl('a'.repeat(GOOGLE_TTS_MAX_CHARS), 'id-ID')).not.toThrow()
  })
})
