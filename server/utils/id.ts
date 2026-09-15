import { randomBytes } from 'node:crypto'
import { ulid } from 'ulid'

/** Primary key aplikasi: ULID 26 karakter, time-sortable (§31). */
export function newId(): string {
  return ulid()
}

/**
 * Token publik untuk tracking antrean tanpa login (§43).
 * 32 byte acak → 43 karakter base64url. Tidak pernah mengekspos ID database.
 */
export function newPublicToken(): string {
  return randomBytes(32).toString('base64url')
}

/** Kode pendek untuk publish page / display device (huruf & angka tanpa karakter ambigu). */
const SHORT_ALPHABET = '23456789abcdefghjkmnpqrstuvwxyz'

export function newShortCode(length = 8): string {
  const bytes = randomBytes(length)
  let out = ''
  for (let i = 0; i < length; i++) {
    out += SHORT_ALPHABET[bytes[i]! % SHORT_ALPHABET.length]
  }
  return out
}

/** Slug URL-safe dari teks bebas. */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100)
}
