import type { Prisma } from '../../generated/prisma/client'

/**
 * Satu halaman publik punya dua alamat.
 *
 * `/p/w8j4hz76` memakai kode publikasi yang bisa diganti kapan saja — itulah yang
 * dicetak sebagai QR, dan mengganti kodenya sekaligus mematikan cetakan lama.
 * `/p/layanan-ahu-kuningan-city` memakai slug yang ditulis admin dan tidak pernah
 * berubah sendiri, jadi aman ditempel di situs atau dibagikan di pesan.
 *
 * Keduanya membuka halaman yang sama persis. Modul ini menyatukan cara mencarinya
 * supaya tidak ada satu pun endpoint publik yang diam-diam hanya menerima salah satu.
 */

/** Cocokkan pada kode publikasi ATAU slug. */
export function byCodeOrSlug(codeOrSlug: string): Prisma.PublicPageWhereInput {
  return { OR: [{ publishCode: codeOrSlug }, { slug: codeOrSlug }] }
}

/**
 * Pilih baris yang benar bila keduanya cocok.
 *
 * Slug satu halaman secara teori bisa sama dengan kode publikasi halaman lain —
 * keduanya divalidasi terpisah. Kode publikasi dimenangkan karena itulah yang
 * tercetak di QR: tautan yang sudah beredar tidak boleh berpindah tujuan hanya
 * karena admin lain memilih slug yang kebetulan sama.
 */
export function pickCanonical<T extends { publishCode: string }>(rows: T[], codeOrSlug: string): T | undefined {
  return rows.find(row => row.publishCode === codeOrSlug) ?? rows[0]
}
