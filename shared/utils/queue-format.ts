/**
 * Format nomor antrean (§7). Dipakai server saat generate dan klien saat preview
 * di admin — satu implementasi supaya preview tidak pernah berbeda dari hasil asli.
 *
 * Placeholder yang didukung:
 *   {prefix}  → prefix queue type, mis. "A"
 *   {code}    → code queue type, mis. "UM"
 *   {seq}     → nomor urut dengan padding
 *   {yyyy} {mm} {dd} → bagian tanggal layanan
 */
export interface QueueNumberParts {
  prefix: string
  code?: string
  sequence: number
  padding?: number
  serviceDate?: string // 'YYYY-MM-DD'
}

export function formatQueueNumber(format: string, parts: QueueNumberParts): string {
  const padding = parts.padding ?? 3
  const seq = String(parts.sequence).padStart(padding, '0')
  const [yyyy = '', mm = '', dd = ''] = (parts.serviceDate ?? '').split('-')

  return (format || '{prefix}{seq}')
    .replaceAll('{prefix}', parts.prefix ?? '')
    .replaceAll('{code}', parts.code ?? '')
    .replaceAll('{seq}', seq)
    .replaceAll('{yyyy}', yyyy)
    .replaceAll('{mm}', mm)
    .replaceAll('{dd}', dd)
}

export const QUEUE_NUMBER_FORMAT_PRESETS = [
  { label: 'A001', value: '{prefix}{seq}' },
  { label: 'A-001', value: '{prefix}-{seq}' },
  { label: 'UM-001', value: '{code}-{seq}' },
  { label: '001', value: '{seq}' },
  { label: 'A0905001', value: '{prefix}{mm}{dd}{seq}' },
]

/** Label bahasa Indonesia untuk status antrean (§41). */
export const QUEUE_STATUS_LABEL: Record<string, string> = {
  WAITING: 'Menunggu',
  CALLED: 'Dipanggil',
  SERVING: 'Dilayani',
  SKIPPED: 'Dilewati',
  COMPLETED: 'Selesai',
  CANCELLED: 'Dibatalkan',
  NO_SHOW: 'Tidak Hadir',
}

export const QUEUE_STATUS_COLOR: Record<string, string> = {
  WAITING: 'neutral',
  CALLED: 'warning',
  SERVING: 'info',
  SKIPPED: 'warning',
  COMPLETED: 'success',
  CANCELLED: 'error',
  NO_SHOW: 'error',
}

export const EVENT_STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Draf',
  SCHEDULED: 'Terjadwal',
  OPEN: 'Buka',
  PAUSED: 'Jeda',
  CLOSED: 'Tutup',
  COMPLETED: 'Selesai',
}

export const EVENT_STATUS_COLOR: Record<string, string> = {
  DRAFT: 'neutral',
  SCHEDULED: 'info',
  OPEN: 'success',
  PAUSED: 'warning',
  CLOSED: 'error',
  COMPLETED: 'neutral',
}
