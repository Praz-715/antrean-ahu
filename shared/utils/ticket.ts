/**
 * Susunan tiket antrean (§46).
 *
 * Isi tiket dipisahkan dari cara mencetaknya. Hari ini yang dipakai cetak lewat
 * peramban, tetapi struktur yang sama sudah siap dikirim ke printer termal: satu
 * `renderTicketText()` menghasilkan tata letak kolom-tetap yang tinggal diteruskan
 * sebagai perintah ESC/POS, tanpa perlu menulis ulang isinya.
 */

export interface TicketPayload {
  organizationName: string
  eventName?: string | null
  queueNumber: string
  queueTypeName: string
  counterName?: string | null
  serviceDate: string
  issuedAt: string
  nowServing?: string | null
  visitorName?: string | null
  footerText?: string | null
  trackUrl?: string | null
}

/** Lebar kertas termal 58 mm pada font standar: 32 karakter. */
export const THERMAL_COLUMNS = 32

function center(text: string, width = THERMAL_COLUMNS): string {
  const trimmed = text.slice(0, width)
  const pad = Math.max(0, Math.floor((width - trimmed.length) / 2))
  return ' '.repeat(pad) + trimmed
}

/** Tanggal panjang gaya tiket: "05 SEP 2026". */
export function ticketDate(serviceDate: string): string {
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MEI', 'JUN', 'JUL', 'AGU', 'SEP', 'OKT', 'NOV', 'DES']
  const [year, month, day] = serviceDate.split('-')
  if (!year || !month || !day) return serviceDate
  return `${day} ${months[Number(month) - 1] ?? month} ${year}`
}

/**
 * Versi teks polos tiket — inilah yang nantinya dikirim ke printer termal.
 * Dipakai juga sebagai pratinjau supaya hasil cetak tidak pernah jadi kejutan.
 */
export function renderTicketText(ticket: TicketPayload, width = THERMAL_COLUMNS): string {
  const lines: string[] = []

  lines.push(center(ticket.organizationName.toUpperCase(), width))
  if (ticket.eventName) lines.push(center(ticket.eventName.toUpperCase(), width))
  lines.push('')
  lines.push(center(ticket.queueNumber, width))
  lines.push('')
  lines.push(center(ticket.queueTypeName.toUpperCase(), width))
  if (ticket.counterName) lines.push(center(ticket.counterName.toUpperCase(), width))
  lines.push('')
  lines.push(center(ticketDate(ticket.serviceDate), width))
  lines.push(center(ticket.issuedAt, width))
  lines.push('')
  lines.push(center('Silakan menunggu', width))
  if (ticket.nowServing) lines.push(center(`Saat ini: ${ticket.nowServing}`, width))
  if (ticket.visitorName) {
    lines.push('')
    lines.push(center(ticket.visitorName, width))
  }
  if (ticket.footerText) {
    lines.push('')
    lines.push(center(ticket.footerText, width))
  }

  return lines.join('\n')
}
