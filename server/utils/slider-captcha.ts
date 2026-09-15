import { randomBytes, randomInt } from 'node:crypto'
import { encodePngDataUrl } from './png'
import { errors } from './response'
import { ERROR_CODES } from '../../shared/constants/errors'
import { createLogger } from './logger'

const log = createLogger('captcha-geser')

/**
 * Captcha geser (teka-teki potongan) yang dijalankan sendiri oleh server ini.
 *
 * Berbeda dari Turnstile (§36) yang menumpang layanan Cloudflare dan perlu kunci
 * dari luar, captcha ini tidak butuh konfigurasi apa pun — dipakai pada halaman
 * masuk dan, bila diaktifkan di formulir, pada pengambilan nomor antrean.
 *
 * Yang membuatnya bukan sekadar hiasan:
 *  - posisi lubang HANYA ada di server; klien cuma menerima dua gambar PNG
 *  - jawabannya sekali pakai dan berumur pendek
 *  - gerakan yang terlalu cepat atau tanpa pergerakan menengah ditolak, jadi
 *    memanggil endpoint verifikasi secara lurus dengan tebakan tidak cukup
 *  - jumlah percobaan per teka-teki dan per alamat IP dibatasi
 *
 * Penyimpanannya di memori, sama seperti rate limit: cukup untuk satu instance.
 * Saat scale-out, pindahkan kedua Map di bawah ke Redis tanpa mengubah pemanggilnya.
 */

/** Ukuran kanvas teka-teki; dipakai juga oleh komponen di klien. */
export const CAPTCHA_CANVAS = { width: 280, height: 170, piece: 52 } as const

/** Jari-jari tonjolan dan takik potongan puzzle. */
const KNOB = 9

/** Seberapa meleset yang masih dianggap pas, dalam piksel. */
const TOLERANSI = 6

/** Umur teka-teki dan umur tiket hasil menyelesaikannya. */
const UMUR_TEKA_TEKI_MS = 3 * 60_000
const UMUR_TIKET_MS = 5 * 60_000

/** Percobaan geser per teka-teki sebelum teka-tekinya dibuang. */
const MAKS_PERCOBAAN = 4

/** Gerakan terlalu cepat atau tanpa titik tengah bukan gerakan tangan manusia. */
const DURASI_MIN_MS = 250
const DURASI_MAKS_MS = 120_000
const GERAKAN_MIN = 4

/** Keperluan tiket; tiket halaman publik tidak bisa dipakai untuk masuk, dan sebaliknya. */
export type CaptchaPurpose = 'login' | 'queue'

interface TekaTeki {
  targetX: number
  purpose: CaptchaPurpose
  ip: string
  kedaluwarsa: number
  percobaan: number
}

interface Tiket {
  purpose: CaptchaPurpose
  ip: string
  kedaluwarsa: number
}

const tekaTeki = new Map<string, TekaTeki>()
const tiket = new Map<string, Tiket>()

let sapuTerakhir = Date.now()

function sapu(now: number) {
  if (now - sapuTerakhir < 30_000) return
  sapuTerakhir = now
  for (const [id, t] of tekaTeki) if (t.kedaluwarsa <= now) tekaTeki.delete(id)
  for (const [id, t] of tiket) if (t.kedaluwarsa <= now) tiket.delete(id)
}

/* ------------------------------------------------------------------ *
 * Menggambar
 * ------------------------------------------------------------------ */

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => {
    const k = (n + h / 30) % 12
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))
  }
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)]
}

interface Gumpalan { x: number, y: number, r: number, h: number }

/**
 * Pemandangan latar dibuat acak tiap teka-teki.
 *
 * Bukan sekadar hiasan: latar yang selalu sama membuat posisi lubang bisa
 * ditemukan hanya dengan membandingkan gambar baru terhadap gambar acuan.
 */
function buatPemandangan() {
  const hueDasar = randomInt(0, 360)
  const gumpalan: Gumpalan[] = Array.from({ length: randomInt(3, 6) }, () => ({
    x: randomInt(0, CAPTCHA_CANVAS.width),
    y: randomInt(0, CAPTCHA_CANVAS.height),
    r: randomInt(50, 130),
    h: (hueDasar + randomInt(-70, 70) + 360) % 360,
  }))
  const miring = (randomInt(0, 2) === 0 ? 1 : -1) * (randomInt(3, 9) / 100)

  return (x: number, y: number): [number, number, number] => {
    // Gradasi dasar yang miring, supaya tidak ada garis horizontal yang bisa ditebak.
    const t = Math.min(1, Math.max(0, (y + x * miring) / CAPTCHA_CANVAS.height))
    let h = hueDasar + t * 40
    let s = 0.45 + t * 0.2
    let l = 0.34 + t * 0.22

    for (const g of gumpalan) {
      const jarak = Math.hypot(x - g.x, y - g.y)
      if (jarak >= g.r) continue
      const bobot = (1 - jarak / g.r) ** 2 * 0.75
      h += ((g.h - h + 540) % 360 - 180) * bobot
      s += bobot * 0.15
      l += bobot * 0.12
    }

    // Butiran halus: memberi tekstur tanpa membuat berkasnya membengkak.
    const butir = ((x * 7 + y * 13) % 11) / 11 * 0.05 - 0.025

    return hslToRgb((h + 360) % 360, Math.min(1, s), Math.min(0.92, Math.max(0.08, l + butir)))
  }
}

/** Bentuk potongan: kotak, dengan tonjolan di atas dan takik di sisi kiri. */
function didalamPotongan(x: number, y: number): boolean {
  const p = CAPTCHA_CANVAS.piece
  const atasKotak = KNOB * 2

  const badan = x >= 0 && x < p && y >= atasKotak && y < p
  const tonjolan = y < atasKotak && Math.hypot(x - p / 2, y - atasKotak) <= KNOB
  const takik = Math.hypot(x, y - (atasKotak + p) / 2) <= KNOB

  return (badan || tonjolan) && !takik
}

function ditepiPotongan(x: number, y: number): boolean {
  if (!didalamPotongan(x, y)) return false
  return !didalamPotongan(x - 1, y) || !didalamPotongan(x + 1, y)
    || !didalamPotongan(x, y - 1) || !didalamPotongan(x, y + 1)
}

/** Menggambar latar berlubang dan potongan yang cocok dengan lubang itu. */
function gambar(targetX: number, pieceY: number) {
  const { width: W, height: H, piece: P } = CAPTCHA_CANVAS
  const pemandangan = buatPemandangan()

  const latar = new Uint8Array(W * H * 4)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4
      let [r, g, b] = pemandangan(x, y)

      const px = x - targetX
      const py = y - pieceY
      if (px >= 0 && px < P && py >= 0 && py < P && didalamPotongan(px, py)) {
        if (ditepiPotongan(px, py)) {
          // Tepi lubang dibuat terang supaya bentuknya terbaca di latar mana pun.
          r = Math.min(255, r + 90); g = Math.min(255, g + 90); b = Math.min(255, b + 90)
        }
        else {
          r = Math.round(r * 0.32); g = Math.round(g * 0.32); b = Math.round(b * 0.32)
        }
      }

      latar[i] = r; latar[i + 1] = g; latar[i + 2] = b; latar[i + 3] = 255
    }
  }

  const potongan = new Uint8Array(P * P * 4)
  for (let y = 0; y < P; y++) {
    for (let x = 0; x < P; x++) {
      const i = (y * P + x) * 4
      if (!didalamPotongan(x, y)) continue

      const [r, g, b] = pemandangan(targetX + x, pieceY + y)
      if (ditepiPotongan(x, y)) {
        potongan[i] = Math.min(255, r + 70)
        potongan[i + 1] = Math.min(255, g + 70)
        potongan[i + 2] = Math.min(255, b + 70)
      }
      else {
        potongan[i] = r; potongan[i + 1] = g; potongan[i + 2] = b
      }
      potongan[i + 3] = 255
    }
  }

  return {
    background: encodePngDataUrl(W, H, latar),
    piece: encodePngDataUrl(P, P, potongan),
  }
}

/* ------------------------------------------------------------------ *
 * Teka-teki & tiket
 * ------------------------------------------------------------------ */

export interface ChallengeResponse {
  id: string
  background: string
  piece: string
  pieceY: number
  width: number
  height: number
  pieceSize: number
}

export function issueChallenge(purpose: CaptchaPurpose, ip: string): ChallengeResponse {
  const now = Date.now()
  sapu(now)

  const { width: W, height: H, piece: P } = CAPTCHA_CANVAS
  // Lubang tidak pernah di ujung kiri: potongan berangkat dari sana, dan jawaban
  // "nol geseran" harus selalu salah.
  const targetX = randomInt(P + 24, W - P - 12)
  const pieceY = randomInt(10, H - P - 10)

  const id = randomBytes(16).toString('base64url')
  tekaTeki.set(id, { targetX, purpose, ip, kedaluwarsa: now + UMUR_TEKA_TEKI_MS, percobaan: 0 })

  const { background, piece } = gambar(targetX, pieceY)
  return { id, background, piece, pieceY, width: W, height: H, pieceSize: P }
}

/**
 * Memeriksa jawaban geseran. Mengembalikan tiket sekali pakai bila pas.
 *
 * `durationMs` dan `moves` dilaporkan klien dan jelas bisa dipalsukan — keduanya
 * bukan pengaman utama, hanya penyaring murah untuk skrip yang menembak endpoint
 * ini apa adanya. Pengaman utamanya tetap: posisi lubang tidak pernah dikirim.
 */
export function solveChallenge(params: {
  id: string
  x: number
  durationMs: number
  moves: number
  purpose: CaptchaPurpose
  ip: string
}): string {
  const now = Date.now()
  sapu(now)

  const t = tekaTeki.get(params.id)
  if (!t || t.kedaluwarsa <= now) {
    tekaTeki.delete(params.id)
    throw errors.badRequest(ERROR_CODES.CAPTCHA_INVALID, 'Teka-teki sudah kedaluwarsa. Coba lagi.')
  }

  if (t.purpose !== params.purpose || t.ip !== params.ip) {
    tekaTeki.delete(params.id)
    log.warn('teka-teki dipakai di tempat lain', { purpose: params.purpose })
    throw errors.badRequest(ERROR_CODES.CAPTCHA_INVALID, 'Verifikasi tidak valid. Coba lagi.')
  }

  t.percobaan += 1
  if (t.percobaan > MAKS_PERCOBAAN) {
    tekaTeki.delete(params.id)
    throw errors.badRequest(ERROR_CODES.CAPTCHA_INVALID, 'Terlalu banyak percobaan. Muat teka-teki baru.')
  }

  const wajar = params.durationMs >= DURASI_MIN_MS
    && params.durationMs <= DURASI_MAKS_MS
    && params.moves >= GERAKAN_MIN

  if (!wajar || Math.abs(params.x - t.targetX) > TOLERANSI) {
    // Teka-teki tidak langsung dibuang: pengguna sungguhan sering meleset sedikit.
    throw errors.badRequest(ERROR_CODES.CAPTCHA_INVALID, 'Potongan belum pas. Coba lagi.')
  }

  tekaTeki.delete(params.id)

  const token = randomBytes(24).toString('base64url')
  tiket.set(token, { purpose: t.purpose, ip: t.ip, kedaluwarsa: now + UMUR_TIKET_MS })
  return token
}

/**
 * Apakah jawaban teka-teki boleh dibuka untuk uji otomatis.
 *
 * Seluruh smoke test dan audit di repo ini masuk lewat halaman masuk — tanpa jalan
 * untuk menyelesaikan teka-teki, tidak satu pun bisa berjalan lagi. Yang dibuka
 * hanyalah jawabannya, jadi uji tetap menempuh verifikasi yang sama persis dengan
 * pengguna sungguhan: tetap harus mengirim posisi, durasi, dan jumlah gerakan yang
 * wajar, dan tetap menerima tiket sekali pakai.
 *
 * Butuh DUA syarat yang tidak mungkin keduanya terjadi tanpa disengaja: bukan mode
 * produksi, DAN `CAPTCHA_DEV_BYPASS=1`.
 */
export function isAnswerRevealAllowed(): boolean {
  return process.env.NODE_ENV !== 'production' && process.env.CAPTCHA_DEV_BYPASS === '1'
}

/** Menukarkan tiket. Sekali pakai: pemanggilan kedua dengan tiket sama akan gagal. */
export function consumeTicket(token: string | null | undefined, purpose: CaptchaPurpose, ip: string): void {
  if (!token) {
    throw errors.badRequest(ERROR_CODES.CAPTCHA_REQUIRED, 'Selesaikan verifikasi geser terlebih dahulu')
  }

  const now = Date.now()
  const t = tiket.get(token)
  if (!t || t.kedaluwarsa <= now || t.purpose !== purpose || t.ip !== ip) {
    tiket.delete(token)
    throw errors.badRequest(ERROR_CODES.CAPTCHA_INVALID, 'Verifikasi geser sudah kedaluwarsa. Ulangi.')
  }

  tiket.delete(token)
}

/** Mengosongkan seluruh penyimpanan — dipakai unit test. */
export function resetCaptchaStore(): void {
  tekaTeki.clear()
  tiket.clear()
}

/** Posisi jawaban sebuah teka-teki; hanya boleh dipanggil lewat `isAnswerRevealAllowed`. */
export function revealTarget(id: string): number | undefined {
  return tekaTeki.get(id)?.targetX
}
