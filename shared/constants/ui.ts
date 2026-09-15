/**
 * Nilai sentinel untuk komponen select.
 *
 * Nuxt UI v4 (Reka UI) menolak item select bernilai string kosong — string kosong
 * dicadangkan untuk "tidak ada pilihan" pada model. Jadi opsi "semua" dan
 * "tidak dipilih" memakai nilai khusus, lalu diterjemahkan saat dikirim ke API.
 */
export const SELECT_ALL = '__all__'
export const SELECT_NONE = '__none__'

/** Untuk filter: kembalikan `undefined` bila pengguna memilih "semua". */
export function filterValue(value: string | undefined | null): string | undefined {
  return !value || value === SELECT_ALL || value === SELECT_NONE ? undefined : value
}

/** Untuk kolom opsional: kembalikan `null` bila pengguna memilih "tidak dipilih". */
export function nullableValue(value: string | undefined | null): string | null {
  return !value || value === SELECT_NONE || value === SELECT_ALL ? null : value
}
