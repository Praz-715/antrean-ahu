import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { errors } from './response'
import { ERROR_CODES } from '../../shared/constants/errors'

/**
 * Penjagaan permintaan keluar untuk data source eksternal (§6, §36).
 *
 * Admin boleh mengetik URL apa pun, dan URL itu dipanggil oleh SERVER — bukan oleh
 * peramban pengunjung. Tanpa penjagaan, kolom itu berubah menjadi alat untuk
 * mengintip jaringan internal: `http://127.0.0.1:3306`, `http://169.254.169.254`
 * (metadata cloud), atau host internal yang tidak pernah terekspos ke publik.
 *
 * Karena itu nama host diresolusi lebih dulu, lalu ALAMAT hasil resolusi yang
 * diperiksa — bukan sekadar teks host-nya. Pemeriksaan berbasis teks gampang
 * dilewati oleh nama domain yang sengaja diarahkan ke 127.0.0.1.
 */

/** Host privat diizinkan hanya bila operator menyatakannya eksplisit (untuk dev). */
function allowPrivateHosts() {
  return process.env.DATA_SOURCE_ALLOW_PRIVATE === 'true'
}

/** Bila diisi, hanya host pada daftar ini yang boleh dihubungi. */
function hostAllowlist(): string[] {
  return (process.env.DATA_SOURCE_HOST_ALLOWLIST ?? '')
    .split(',')
    .map(h => h.trim().toLowerCase())
    .filter(Boolean)
}

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.').map(Number)
  if (parts.length !== 4 || parts.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return true
  const [a, b] = parts as [number, number, number, number]

  if (a === 0) return true // "this network"
  if (a === 10) return true // 10.0.0.0/8
  if (a === 127) return true // loopback
  if (a === 169 && b === 254) return true // link-local + metadata cloud
  if (a === 172 && b >= 16 && b <= 31) return true // 172.16.0.0/12
  if (a === 192 && b === 168) return true // 192.168.0.0/16
  if (a === 192 && b === 0) return true // 192.0.0.0/24 IETF
  if (a === 100 && b >= 64 && b <= 127) return true // CGNAT 100.64.0.0/10
  if (a >= 224) return true // multicast + reserved
  return false
}

function isPrivateIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase().split('%')[0]!

  if (normalized === '::' || normalized === '::1') return true
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true // unique local fc00::/7
  if (normalized.startsWith('fe8') || normalized.startsWith('fe9')
    || normalized.startsWith('fea') || normalized.startsWith('feb')) return true // link-local
  if (normalized.startsWith('ff')) return true // multicast

  // IPv4 yang dipetakan ke IPv6 (::ffff:127.0.0.1) memakai aturan IPv4
  const mapped = normalized.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/)
  if (mapped) return isPrivateIPv4(mapped[1]!)

  return false
}

export function isPrivateAddress(ip: string): boolean {
  const version = isIP(ip)
  if (version === 4) return isPrivateIPv4(ip)
  if (version === 6) return isPrivateIPv6(ip)
  return true // bukan IP yang bisa dikenali — tolak saja
}

/**
 * Alamat yang TIDAK PERNAH boleh dihubungi, bahkan saat DATA_SOURCE_ALLOW_PRIVATE
 * dinyalakan.
 *
 * Kelonggaran itu ada supaya pengembang bisa menunjuk ke sumber data di localhost.
 * Ia tidak boleh sekalian membuka 169.254.169.254 — endpoint metadata cloud yang
 * membagikan kredensial instance kepada siapa pun yang bisa memanggilnya. Satu
 * kesalahan menyalin .env ke server produksi tidak boleh berujung di sana.
 */
export function isAlwaysBlockedAddress(ip: string): boolean {
  const version = isIP(ip)
  if (version === 4) {
    const [a, b] = ip.split('.').map(Number)
    if (a === 169 && b === 254) return true // link-local + metadata cloud
    if (a !== undefined && a >= 224) return true // multicast & reserved
    return false
  }
  if (version === 6) {
    const normalized = ip.toLowerCase().split('%')[0]!
    if (/^fe[89ab]/.test(normalized)) return true // link-local
    if (normalized.startsWith('ff')) return true // multicast
    const mapped = normalized.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/)
    if (mapped) return isAlwaysBlockedAddress(mapped[1]!)
    return false
  }
  return true
}

export interface SafeUrlResult {
  url: URL
  addresses: string[]
}

/**
 * Pastikan sebuah URL aman dipanggil server. Melempar AppError bila tidak.
 * Hasilnya menyertakan alamat hasil resolusi supaya bisa ditampilkan saat uji koneksi.
 */
export async function assertSafeUrl(rawUrl: string): Promise<SafeUrlResult> {
  let url: URL
  try {
    url = new URL(rawUrl)
  }
  catch {
    throw errors.validation('URL tidak valid')
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw errors.validation('Hanya URL http dan https yang didukung')
  }

  if (url.username || url.password) {
    throw errors.validation('Jangan menaruh kredensial di dalam URL — pakai kolom autentikasi')
  }

  const allowlist = hostAllowlist()
  const host = url.hostname.toLowerCase()
  if (allowlist.length && !allowlist.includes(host)) {
    throw errors.validation(`Host "${host}" tidak ada pada daftar host yang diizinkan (DATA_SOURCE_HOST_ALLOWLIST)`)
  }

  // Host yang sudah berupa IP tidak perlu diresolusi
  if (isIP(host)) {
    assertAddressAllowed(host, host)
    return { url, addresses: [host] }
  }

  let addresses: string[]
  try {
    const resolved = await lookup(host, { all: true })
    addresses = resolved.map(r => r.address)
  }
  catch {
    throw errors.validation(`Nama host "${host}" tidak dapat diresolusi`)
  }

  if (!addresses.length) throw errors.validation(`Nama host "${host}" tidak dapat diresolusi`)

  for (const address of addresses) assertAddressAllowed(address, host)

  return { url, addresses }
}

function assertAddressAllowed(address: string, host: string) {
  if (isAlwaysBlockedAddress(address)) {
    throw errors.validation(`Host "${host}" mengarah ke alamat internal (${address}) dan selalu diblokir`)
  }
  if (isPrivateAddress(address) && !allowPrivateHosts()) {
    throw errors.validation(`Host "${host}" mengarah ke alamat internal (${address}) dan diblokir`)
  }
}

export interface SafeFetchOptions {
  method?: string
  headers?: Record<string, string>
  body?: string | null
  timeoutMs?: number
  /** Batas ukuran respons; pembacaan dihentikan setelah terlampaui. */
  maxBytes?: number
}

export interface SafeFetchResult {
  status: number
  ok: boolean
  durationMs: number
  bodyText: string
  truncated: boolean
  addresses: string[]
}

const DEFAULT_MAX_BYTES = 512 * 1024

/**
 * Permintaan HTTP keluar yang sudah dijaga: URL divalidasi, redirect ditolak,
 * ada batas waktu, dan ukuran respons dipotong.
 *
 * Redirect sengaja tidak diikuti. Server yang berniat jahat cukup menjawab
 * `302 Location: http://127.0.0.1:6379` untuk membatalkan seluruh pemeriksaan
 * alamat yang baru saja dilakukan.
 */
export async function safeFetch(rawUrl: string, options: SafeFetchOptions = {}): Promise<SafeFetchResult> {
  const { url, addresses } = await assertSafeUrl(rawUrl)
  const timeoutMs = Math.min(30_000, Math.max(500, options.timeoutMs ?? 5000))
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES
  const startedAt = Date.now()

  let response: Response
  try {
    response = await fetch(url, {
      method: options.method ?? 'GET',
      headers: options.headers,
      body: options.body ?? undefined,
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
    })
  }
  catch (error) {
    const message = (error as Error).name === 'TimeoutError'
      ? `Tidak ada jawaban dalam ${timeoutMs} ms`
      : (error as Error).message
    throw errors.badRequest(ERROR_CODES.DATA_SOURCE_UNREACHABLE, `Gagal menghubungi sumber data: ${message}`)
  }

  if (response.status >= 300 && response.status < 400) {
    throw errors.badRequest(
      ERROR_CODES.DATA_SOURCE_UNREACHABLE,
      'Sumber data membalas dengan redirect; arahkan langsung ke URL tujuan',
    )
  }

  const { text, truncated } = await readCapped(response, maxBytes)

  return {
    status: response.status,
    ok: response.ok,
    durationMs: Date.now() - startedAt,
    bodyText: text,
    truncated,
    addresses,
  }
}

/**
 * Versi biner dari `safeFetch`, untuk respons yang bukan teks (mis. audio TTS).
 *
 * Penjagaannya sama persis — URL divalidasi, alamat privat ditolak, redirect tidak
 * diikuti, ada batas waktu dan batas ukuran — hanya isinya yang dikembalikan sebagai
 * byte, bukan string. Dipisah supaya `safeFetch` tetap sederhana untuk pemakaian
 * JSON yang jauh lebih sering.
 */
export async function safeFetchBinary(rawUrl: string, options: SafeFetchOptions = {}): Promise<{
  status: number
  ok: boolean
  contentType: string
  bytes: Uint8Array
  durationMs: number
}> {
  const { url } = await assertSafeUrl(rawUrl)
  const timeoutMs = Math.min(30_000, Math.max(500, options.timeoutMs ?? 5000))
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES
  const startedAt = Date.now()

  let response: Response
  try {
    response = await fetch(url, {
      method: options.method ?? 'GET',
      headers: options.headers,
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
    })
  }
  catch (error) {
    const message = (error as Error).name === 'TimeoutError'
      ? `Tidak ada jawaban dalam ${timeoutMs} ms`
      : (error as Error).message
    throw errors.badRequest(ERROR_CODES.DATA_SOURCE_UNREACHABLE, `Gagal menghubungi layanan: ${message}`)
  }

  if (response.status >= 300 && response.status < 400) {
    throw errors.badRequest(
      ERROR_CODES.DATA_SOURCE_UNREACHABLE,
      'Layanan membalas dengan redirect; arahkan langsung ke URL tujuan',
    )
  }

  const buffer = await response.arrayBuffer()
  if (buffer.byteLength > maxBytes) {
    throw errors.badRequest(
      ERROR_CODES.DATA_SOURCE_UNREACHABLE,
      `Jawaban lebih besar dari batas ${Math.round(maxBytes / 1024)} KB`,
    )
  }

  return {
    status: response.status,
    ok: response.ok,
    contentType: response.headers.get('content-type') ?? '',
    bytes: new Uint8Array(buffer),
    durationMs: Date.now() - startedAt,
  }
}

/** Baca body secukupnya saja — jangan sampai satu respons raksasa menghabiskan memori. */
async function readCapped(response: Response, maxBytes: number) {
  if (!response.body) return { text: '', truncated: false }

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let received = 0
  let truncated = false

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (!value) continue
    received += value.byteLength
    if (received > maxBytes) {
      chunks.push(value.subarray(0, Math.max(0, value.byteLength - (received - maxBytes))))
      truncated = true
      await reader.cancel().catch(() => {})
      break
    }
    chunks.push(value)
  }

  return { text: Buffer.concat(chunks).toString('utf8'), truncated }
}
