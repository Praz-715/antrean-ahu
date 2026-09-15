/**
 * Nada panggil bawaan sistem (§22).
 *
 * Berkasnya ikut di dalam aplikasi (`public/tone/`), bukan di Media Library, supaya
 * instalasi baru langsung punya pilihan nada tanpa harus mengunggah apa pun lebih
 * dulu — dan supaya nadanya tidak bisa terhapus tanpa sengaja dari halaman Media.
 *
 * Nilainya disimpan pada pengaturan dengan awalan `system:` sehingga satu kolom saja
 * cukup untuk dua sumber: nada bawaan (`system:tone1`) dan berkas unggahan admin
 * (id media berbentuk ULID).
 */
export const SYSTEM_TONE_PREFIX = 'system:'

export interface SystemTone {
  /** Nilai tersimpan, mis. `system:tone1`. */
  value: string
  label: string
  url: string
}

const TONE_COUNT = 9

export const SYSTEM_TONES: SystemTone[] = Array.from({ length: TONE_COUNT }, (_, i) => {
  const id = `tone${i + 1}`
  return {
    value: `${SYSTEM_TONE_PREFIX}${id}`,
    label: `Nada bawaan ${i + 1}`,
    url: `/tone/${id}.mp3`,
  }
})

const TONE_BY_VALUE = new Map(SYSTEM_TONES.map(t => [t.value, t]))

/** Apakah nilai pengaturan ini merujuk nada bawaan, bukan berkas Media Library? */
export function isSystemTone(value: unknown): boolean {
  return typeof value === 'string' && TONE_BY_VALUE.has(value)
}

/** URL nada bawaan, atau `null` bila nilainya bukan nada bawaan yang dikenal. */
export function systemToneUrl(value: unknown): string | null {
  return typeof value === 'string' ? TONE_BY_VALUE.get(value)?.url ?? null : null
}
