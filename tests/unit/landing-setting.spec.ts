import { describe, expect, it } from 'vitest'
import {
  LANDING_DIRECTORY,
  LANDING_EVENT_PREFIX,
  LANDING_NONE,
  SETTINGS_BY_KEY,
  SETTING_KEYS,
  coerceSetting,
  parseLanding,
} from '../../shared/constants/settings'

const def = SETTINGS_BY_KEY[SETTING_KEYS.SYSTEM_LANDING]!
const ULID = '01M25DM9RHXZJ1QNPTD96J1TYB'

describe('tujuan halaman pangkal', () => {
  it('membaca ketiga bentuk nilainya', () => {
    expect(parseLanding(LANDING_NONE)).toEqual({ mode: 'none', eventId: null })
    expect(parseLanding(LANDING_DIRECTORY)).toEqual({ mode: 'directory', eventId: null })
    expect(parseLanding(LANDING_EVENT_PREFIX + ULID)).toEqual({ mode: 'event', eventId: ULID })
  })

  it('kembali ke halaman sambutan untuk nilai yang tidak dikenal', () => {
    // Termasuk id event yang bentuknya bukan ULID — mis. sisa sunting manual.
    expect(parseLanding('event:bukan-ulid').mode).toBe('none')
    expect(parseLanding('').mode).toBe('none')
    expect(parseLanding(undefined).mode).toBe('none')
    expect(parseLanding(42).mode).toBe('none')
  })

  it('bawaannya tidak mengubah perilaku yang sudah ada', () => {
    expect(def.default).toBe(LANDING_NONE)
  })

  it('validasi di API menolak bentuk yang salah tanpa menjatuhkan pengaturan lain', () => {
    expect(coerceSetting(def, LANDING_DIRECTORY)).toBe(LANDING_DIRECTORY)
    expect(coerceSetting(def, LANDING_EVENT_PREFIX + ULID)).toBe(LANDING_EVENT_PREFIX + ULID)
    expect(coerceSetting(def, 'event:xxx')).toBe(LANDING_NONE)
    expect(coerceSetting(def, 'halaman-lain')).toBe(LANDING_NONE)
    expect(coerceSetting(def, null)).toBe(LANDING_NONE)
  })
})
