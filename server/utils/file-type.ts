/**
 * Validasi berkas berdasarkan isi, bukan nama atau header Content-Type (§36).
 *
 * Nama berkas dan MIME dari klien mudah dipalsukan; yang diperiksa di sini adalah
 * magic byte di awal berkas. Juga membaca dimensi gambar tanpa dependensi native,
 * supaya tidak perlu memasang pustaka pengolah gambar hanya demi lebar × tinggi.
 */

export type DetectedKind = 'IMAGE' | 'VIDEO' | 'AUDIO'

export interface DetectedFile {
  kind: DetectedKind
  mime: string
  extension: string
  width?: number
  height?: number
}

const startsWith = (buf: Buffer, bytes: number[], offset = 0) =>
  bytes.every((b, i) => buf[offset + i] === b)

/** Kenali tipe berkas dari magic byte-nya. Mengembalikan null bila tidak didukung. */
export function detectFileType(buf: Buffer): DetectedFile | null {
  if (buf.length < 12) return null

  // JPEG: FF D8 FF
  if (startsWith(buf, [0xFF, 0xD8, 0xFF])) {
    const size = jpegSize(buf)
    return { kind: 'IMAGE', mime: 'image/jpeg', extension: 'jpg', ...size }
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (startsWith(buf, [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])) {
    return {
      kind: 'IMAGE',
      mime: 'image/png',
      extension: 'png',
      width: buf.readUInt32BE(16),
      height: buf.readUInt32BE(20),
    }
  }

  // WEBP: 'RIFF' .... 'WEBP'
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    return { kind: 'IMAGE', mime: 'image/webp', extension: 'webp', ...webpSize(buf) }
  }

  // MP4 / M4V / M4A: kotak 'ftyp' pada offset 4
  if (buf.toString('ascii', 4, 8) === 'ftyp') {
    const brand = buf.toString('ascii', 8, 12)

    // M4A memakai wadah yang sama dengan MP4, dibedakan oleh brand-nya.
    if (brand.startsWith('M4A')) {
      return { kind: 'AUDIO', mime: 'audio/mp4', extension: 'm4a' }
    }

    const supported = ['isom', 'iso2', 'mp41', 'mp42', 'avc1', 'M4V ', 'dash']
    if (supported.some(b => brand.startsWith(b.trim()))) {
      return { kind: 'VIDEO', mime: 'video/mp4', extension: 'mp4' }
    }
  }

  /**
   * MP3 dikenali dua cara: berkas hasil tagging diawali 'ID3', sedangkan berkas
   * mentah langsung dimulai dengan frame sync (11 bit menyala: FF Ex/Fx).
   */
  if (buf.toString('ascii', 0, 3) === 'ID3') {
    return { kind: 'AUDIO', mime: 'audio/mpeg', extension: 'mp3' }
  }
  if (buf[0] === 0xFF && (buf[1]! & 0xE0) === 0xE0) {
    return { kind: 'AUDIO', mime: 'audio/mpeg', extension: 'mp3' }
  }

  // WAV: 'RIFF' .... 'WAVE'
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WAVE') {
    return { kind: 'AUDIO', mime: 'audio/wav', extension: 'wav' }
  }

  // OGG / Opus: 'OggS'
  if (buf.toString('ascii', 0, 4) === 'OggS') {
    return { kind: 'AUDIO', mime: 'audio/ogg', extension: 'ogg' }
  }

  return null
}

/** Lebar & tinggi JPEG dibaca dari penanda SOF pertama. */
function jpegSize(buf: Buffer): { width?: number, height?: number } {
  let offset = 2
  while (offset + 9 < buf.length) {
    if (buf[offset] !== 0xFF) { offset++; continue }

    const marker = buf[offset + 1]!
    // SOF0–SOF15 kecuali penanda non-frame (C4 = DHT, C8 = JPG, CC = DAC)
    if (marker >= 0xC0 && marker <= 0xCF && ![0xC4, 0xC8, 0xCC].includes(marker)) {
      return { height: buf.readUInt16BE(offset + 5), width: buf.readUInt16BE(offset + 7) }
    }

    const length = buf.readUInt16BE(offset + 2)
    if (length < 2) break
    offset += 2 + length
  }
  return {}
}

/** WEBP punya tiga varian kotak: lossy (VP8), lossless (VP8L), extended (VP8X). */
function webpSize(buf: Buffer): { width?: number, height?: number } {
  const chunk = buf.toString('ascii', 12, 16)

  if (chunk === 'VP8 ' && buf.length > 30) {
    return { width: buf.readUInt16LE(26) & 0x3FFF, height: buf.readUInt16LE(28) & 0x3FFF }
  }

  if (chunk === 'VP8L' && buf.length > 25) {
    const bits = buf.readUInt32LE(21)
    return { width: (bits & 0x3FFF) + 1, height: ((bits >> 14) & 0x3FFF) + 1 }
  }

  if (chunk === 'VP8X' && buf.length > 30) {
    const width = 1 + (buf[24]! | (buf[25]! << 8) | (buf[26]! << 16))
    const height = 1 + (buf[27]! | (buf[28]! << 8) | (buf[29]! << 16))
    return { width, height }
  }

  return {}
}
