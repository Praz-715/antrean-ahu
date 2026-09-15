import { deflateSync } from 'node:zlib'

/**
 * Encoder PNG minimal (RGBA, 8 bit) di atas `node:zlib`.
 *
 * Dipakai captcha geser untuk menggambar latar teka-teki dan potongannya di server.
 * Gambarnya HARUS jadi di server: kalau klien yang menggambar, posisi lubang ikut
 * terkirim ke peramban dan skrip mana pun tinggal membacanya — captcha-nya jadi
 * sekadar hiasan.
 *
 * Ditulis sendiri, bukan memakai pustaka gambar, karena yang dibutuhkan cuma satu
 * hal: menyusun piksel mentah menjadi PNG. `sharp` dan `canvas` sama-sama menarik
 * biner native yang harus dikompilasi ulang tiap ganti versi Node — beban yang
 * tidak sebanding untuk gambar 280×170.
 */

const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return table
})()

function crc32(buf: Buffer): number {
  let c = -1
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]!) & 0xFF]! ^ (c >>> 8)
  return (c ^ -1) >>> 0
}

/** Satu blok PNG: panjang, tipe, isi, lalu CRC dari tipe+isi. */
function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length, 0)

  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data])

  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(typeAndData), 0)

  return Buffer.concat([length, typeAndData, crc])
}

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])

/**
 * Menyusun PNG RGBA dari piksel mentah (4 byte per piksel, baris demi baris).
 *
 * Tiap baris diawali byte filter 0 ("None"): tanpa filter, deflate masih memampatkan
 * gradasi dengan baik dan kodenya tetap sependek ini.
 */
export function encodePng(width: number, height: number, rgba: Uint8Array): Buffer {
  if (rgba.length !== width * height * 4) {
    throw new Error(`ukuran piksel tidak cocok: ${rgba.length} untuk ${width}×${height}`)
  }

  const raw = Buffer.alloc(height * (width * 4 + 1))
  for (let y = 0; y < height; y++) {
    const awalBaris = y * (width * 4 + 1)
    raw[awalBaris] = 0
    Buffer.from(rgba.buffer, rgba.byteOffset + y * width * 4, width * 4).copy(raw, awalBaris + 1)
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // kedalaman bit
  ihdr[9] = 6 // tipe warna: RGBA
  ihdr[10] = 0 // kompresi: deflate
  ihdr[11] = 0 // filter: standar
  ihdr[12] = 0 // interlace: tidak

  return Buffer.concat([
    SIGNATURE,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/** PNG siap pasang di `<img src>`. */
export function encodePngDataUrl(width: number, height: number, rgba: Uint8Array): string {
  return `data:image/png;base64,${encodePng(width, height, rgba).toString('base64')}`
}
