import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

/**
 * Enkripsi kredensial data source eksternal (§6): AES-256-GCM.
 * Format blob: [12B IV][16B auth tag][ciphertext]
 */
const ALGO = 'aes-256-gcm'
const IV_LEN = 12
const TAG_LEN = 16

function getKey(): Buffer {
  const raw = process.env.APP_ENCRYPTION_KEY
  if (!raw || raw.length < 32) {
    throw new Error('APP_ENCRYPTION_KEY belum diset (butuh 32 byte hex / 64 karakter)')
  }
  // terima hex 64 karakter, atau turunkan lewat sha256 untuk kemudahan dev
  return /^[0-9a-f]{64}$/i.test(raw)
    ? Buffer.from(raw, 'hex')
    : createHash('sha256').update(raw).digest()
}

export function encryptJson(value: unknown): Buffer {
  const iv = randomBytes(IV_LEN)
  const cipher = createCipheriv(ALGO, getKey(), iv)
  const plain = Buffer.from(JSON.stringify(value), 'utf8')
  const encrypted = Buffer.concat([cipher.update(plain), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted])
}

export function decryptJson<T = unknown>(blob: Buffer | Uint8Array | null | undefined): T | null {
  if (!blob || blob.length <= IV_LEN + TAG_LEN) return null
  const buf = Buffer.from(blob)
  const iv = buf.subarray(0, IV_LEN)
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN)
  const data = buf.subarray(IV_LEN + TAG_LEN)
  const decipher = createDecipheriv(ALGO, getKey(), iv)
  decipher.setAuthTag(tag)
  const plain = Buffer.concat([decipher.update(data), decipher.final()])
  return JSON.parse(plain.toString('utf8')) as T
}

/** Hash token perangkat display — disimpan hashed, bukan plaintext. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url')
}
