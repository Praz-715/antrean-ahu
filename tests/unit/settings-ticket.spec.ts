import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SETTINGS,
  SETTINGS_BY_KEY,
  SETTINGS_CATALOG,
  SETTING_KEYS,
  coerceSetting,
} from '../../shared/constants/settings'
import { renderTicketText, ticketDate, THERMAL_COLUMNS } from '../../shared/utils/ticket'

describe('katalog pengaturan (§49)', () => {
  it('setiap kunci punya definisi dan nilai bawaan', () => {
    for (const key of Object.values(SETTING_KEYS)) {
      expect(SETTINGS_BY_KEY[key], `definisi ${key}`).toBeDefined()
      expect(DEFAULT_SETTINGS[key], `bawaan ${key}`).toBeDefined()
    }
  })

  it('tidak ada kunci ganda', () => {
    const keys = SETTINGS_CATALOG.map(d => d.key)
    expect(new Set(keys).size).toBe(keys.length)
  })
})

describe('coerceSetting', () => {
  const recallLimit = SETTINGS_BY_KEY[SETTING_KEYS.QUEUE_RECALL_LIMIT]!
  const ratingEnabled = SETTINGS_BY_KEY[SETTING_KEYS.FEEDBACK_RATING_ENABLED]!
  const timezone = SETTINGS_BY_KEY[SETTING_KEYS.SYSTEM_TIMEZONE]!
  const prefix = SETTINGS_BY_KEY[SETTING_KEYS.QUEUE_DEFAULT_PREFIX]!

  it('angka dijepit pada rentangnya dan dibulatkan', () => {
    expect(coerceSetting(recallLimit, 99)).toBe(20)
    expect(coerceSetting(recallLimit, -5)).toBe(0)
    expect(coerceSetting(recallLimit, '3')).toBe(3)
    expect(coerceSetting(recallLimit, 2.6)).toBe(3)
  })

  it('nilai yang tidak masuk akal jatuh ke bawaan, bukan lolos apa adanya', () => {
    expect(coerceSetting(recallLimit, 'entah')).toBe(recallLimit.default)
    expect(coerceSetting(timezone, 'Mars/Olympus')).toBe('Asia/Jakarta')
    expect(coerceSetting(ratingEnabled, null)).toBe(true)
  })

  it('boolean menerima bentuk teks dari kolom JSON lama', () => {
    expect(coerceSetting(ratingEnabled, 'true')).toBe(true)
    expect(coerceSetting(ratingEnabled, 0)).toBe(false)
  })

  it('teks dipotong sesuai batas panjangnya', () => {
    expect(coerceSetting(prefix, 'ABCDEFGHIJKLMNO')).toHaveLength(prefix.maxLength!)
  })
})

describe('tiket antrean (§46)', () => {
  const ticket = {
    organizationName: 'Puskesmas Contoh',
    queueNumber: 'A023',
    queueTypeName: 'Poli Umum',
    serviceDate: '2026-09-05',
    issuedAt: '08:14',
    nowServing: 'A019',
  }

  it('tanggal ditulis gaya tiket', () => {
    expect(ticketDate('2026-09-05')).toBe('05 SEP 2026')
    expect(ticketDate('2026-01-31')).toBe('31 JAN 2026')
  })

  it('teks termal memuat seluruh informasi penting', () => {
    const text = renderTicketText(ticket)
    expect(text).toContain('PUSKESMAS CONTOH')
    expect(text).toContain('A023')
    expect(text).toContain('POLI UMUM')
    expect(text).toContain('05 SEP 2026')
    expect(text).toContain('Silakan menunggu')
    expect(text).toContain('Saat ini: A019')
  })

  it('tidak ada baris yang melebihi lebar kertas', () => {
    for (const line of renderTicketText(ticket).split('\n')) {
      expect(line.length).toBeLessThanOrEqual(THERMAL_COLUMNS)
    }
  })
})
