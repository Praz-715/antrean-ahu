/**
 * Tingkat prioritas antrean (§57, improvement §58).
 *
 * Kolom `queues.priority` sudah dipakai sebagai kunci urutan pertama pada
 * pemanggilan NEXT (`ORDER BY priority DESC, sequence_number ASC`), jadi nomor
 * berprioritas otomatis dipanggil lebih dulu tanpa aturan tambahan.
 *
 * Angkanya disengaja berjarak, bukan 0 dan 1: kalau nanti perlu tingkat di
 * antaranya (mis. ibu hamil di atas normal tetapi di bawah darurat), ruangnya
 * sudah ada tanpa harus memindahkan data lama.
 */
export const QUEUE_PRIORITY = {
  /** Antrean biasa. */
  NORMAL: 0,
  /** Didahulukan — lansia, disabilitas, ibu hamil, dan sejenisnya. */
  PRIORITY: 10,
} as const

export type QueuePriority = (typeof QUEUE_PRIORITY)[keyof typeof QUEUE_PRIORITY]

/** Apakah antrean ini perlu ditampilkan sebagai prioritas? */
export function isPriorityQueue(priority: number | null | undefined): boolean {
  return (priority ?? QUEUE_PRIORITY.NORMAL) >= QUEUE_PRIORITY.PRIORITY
}

export const PRIORITY_LABEL = 'PRIORITAS'
