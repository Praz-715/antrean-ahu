/**
 * Penulisan CSV.
 *
 * Dipisah dari export.service agar penanganan BOM dan pelolosan tanda kutip
 * berada di satu tempat yang mudah diuji.
 */

/** Tanda BOM UTF-8: tanpa ini Excel di Windows salah membaca huruf beraksen. */
const UTF8_BOM = '﻿'

export function escapeCsvCell(value: string | number | null | undefined): string {
  const text = String(value ?? '')
  return /[",\n\r;]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

export function buildCsv(headers: string[], rows: Array<Record<string, string | number>>): Buffer {
  const lines = [headers.map(escapeCsvCell).join(',')]
  for (const row of rows) {
    lines.push(headers.map(header => escapeCsvCell(row[header])).join(','))
  }
  return Buffer.from(UTF8_BOM + lines.join('\r\n'), 'utf8')
}
