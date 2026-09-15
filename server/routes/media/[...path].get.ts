import { stat } from 'node:fs/promises'
import { storage } from '../../utils/storage'

const MIME_BY_EXT: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  mp4: 'video/mp4',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  m4a: 'audio/mp4',
}

/**
 * Sajikan berkas media yang diunggah admin.
 *
 * Berada di `server/routes` (bukan `server/api`) supaya URL-nya bersih dan bisa
 * dipakai langsung pada atribut `src`. Berkas media memang publik: display dan
 * halaman antrean menampilkannya tanpa login.
 */
export default defineEventHandler(async (event) => {
  const segments = getRouterParam(event, 'path') ?? ''
  const relativePath = Array.isArray(segments) ? segments.join('/') : segments

  if (!relativePath || relativePath.includes('..')) {
    throw createError({ statusCode: 400, statusMessage: 'Path tidak valid' })
  }

  let absolute: string
  try {
    absolute = storage.resolve(relativePath)
  }
  catch {
    throw createError({ statusCode: 400, statusMessage: 'Path tidak valid' })
  }

  const info = await stat(absolute).catch(() => null)
  if (!info?.isFile()) {
    throw createError({ statusCode: 404, statusMessage: 'Berkas tidak ditemukan' })
  }

  const extension = relativePath.split('.').pop()?.toLowerCase() ?? ''
  setResponseHeader(event, 'Content-Type', MIME_BY_EXT[extension] ?? 'application/octet-stream')
  setResponseHeader(event, 'Content-Length', info.size)
  // nama berkas memakai ULID dan tidak pernah dipakai ulang, jadi aman di-cache lama
  setResponseHeader(event, 'Cache-Control', 'public, max-age=31536000, immutable')
  setResponseHeader(event, 'X-Content-Type-Options', 'nosniff')

  return sendStream(event, storage.stream(relativePath))
})
