import { PrismaMariaDb } from '@prisma/adapter-mariadb'
import { PrismaClient } from '../../generated/prisma/client'

/**
 * Satu instance PrismaClient untuk seluruh proses.
 *
 * Timezone driver dipaksa ke UTC ('Z'): server MySQL di dev berjalan pada
 * SYSTEM time zone (Asia/Jakarta), sedangkan seluruh DATETIME aplikasi
 * disimpan dalam UTC (§50). Tanpa ini, konversi driver akan menggeser waktu 7 jam.
 */
function buildAdapter() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL belum diset')

  const parsed = new URL(url)
  const host = parsed.hostname

  /**
   * MySQL 8+ memakai `caching_sha2_password`. Pada koneksi TANPA TLS, autentikasi
   * penuh menuntut klien mengambil RSA public key server lebih dulu — dan itu harus
   * diizinkan eksplisit, kalau tidak koneksinya gagal dengan
   * `ER_CANNOT_RETRIEVE_RSA_KEY` dan pool tidak pernah terisi.
   *
   * Gejalanya mudah menyesatkan: server MySQL menyimpan cache autentikasi di memori,
   * jadi selama kontainernya belum pernah restart semuanya tampak normal. Begitu
   * MySQL naik ulang, cache itu hilang dan seluruh aplikasi berhenti terhubung tanpa
   * ada yang berubah di kode.
   *
   * Hanya dinyalakan untuk host lokal. Di luar itu jawaban yang benar adalah TLS,
   * bukan mengambil kunci publik lewat kanal yang tidak terenkripsi — dan bila
   * memang diperlukan, harus dinyatakan lewat DATABASE_ALLOW_PUBLIC_KEY_RETRIEVAL.
   */
  const isLocalHost = ['localhost', '127.0.0.1', '::1'].includes(host)
  const allowPublicKeyRetrieval = process.env.DATABASE_ALLOW_PUBLIC_KEY_RETRIEVAL
    ? process.env.DATABASE_ALLOW_PUBLIC_KEY_RETRIEVAL === 'true'
    : isLocalHost

  return new PrismaMariaDb({
    host,
    port: Number(parsed.port || 3306),
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: parsed.pathname.replace(/^\//, ''),
    connectionLimit: Number(process.env.DATABASE_POOL_SIZE || 10),
    timezone: 'Z',
    allowPublicKeyRetrieval,
    // MySQL mengembalikan BIGINT sebagai BigInt; kembalikan Number supaya JSON-safe
    bigIntAsNumber: true,
    decimalAsNumber: true,
  })
}

const globalForPrisma = globalThis as unknown as { __antreanPrisma?: PrismaClient }

export const prisma: PrismaClient
  = globalForPrisma.__antreanPrisma
    ?? new PrismaClient({
      adapter: buildAdapter(),
      log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    })

if (process.env.NODE_ENV !== 'production') globalForPrisma.__antreanPrisma = prisma

export type { PrismaClient }
