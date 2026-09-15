import { prisma } from '../utils/prisma'
import { errors } from '../utils/response'
import { ERROR_CODES } from '../../shared/constants/errors'
import { newId } from '../utils/id'
import { storage } from '../utils/storage'
import { detectFileType } from '../utils/file-type'

const MAX_IMAGE_BYTES = Number(process.env.MEDIA_MAX_IMAGE_MB || 10) * 1024 * 1024
const MAX_VIDEO_BYTES = Number(process.env.MEDIA_MAX_VIDEO_MB || 200) * 1024 * 1024
/** Nada panggil & rekaman pengumuman: hitungan detik, bukan menit — 20 MB berlebih pun cukup. */
const MAX_AUDIO_BYTES = Number(process.env.MEDIA_MAX_AUDIO_MB || 20) * 1024 * 1024

const LABEL_TIPE: Record<string, string> = { IMAGE: 'gambar', VIDEO: 'video', AUDIO: 'audio' }

export const mediaService = {
  async list(organizationId: string, params: { type?: 'IMAGE' | 'VIDEO' | 'AUDIO', search?: string } = {}) {
    const items = await prisma.media.findMany({
      where: {
        organizationId,
        deletedAt: null,
        ...(params.type ? { type: params.type } : {}),
        ...(params.search ? { name: { contains: params.search } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      include: { uploadedBy: { select: { id: true, name: true } } },
    })

    return items.map(m => ({ ...m, url: storage.publicUrl(m.filePath) }))
  },

  async getById(organizationId: string, id: string) {
    const media = await prisma.media.findFirst({
      where: { id, organizationId, deletedAt: null },
      include: { uploadedBy: { select: { id: true, name: true } } },
    })
    if (!media) throw errors.notFound('Media tidak ditemukan')
    return { ...media, url: storage.publicUrl(media.filePath) }
  },

  /**
   * Simpan unggahan setelah memeriksa isinya (§36).
   *
   * `durationSeconds` datang dari klien karena membaca durasi video butuh ffprobe;
   * nilainya hanya dipakai untuk lama tayang di playlist, jadi cukup divalidasi
   * sebagai angka wajar, bukan dipercaya mentah-mentah.
   */
  async upload(params: {
    organizationId: string
    uploadedById: string
    buffer: Buffer
    filename: string
    name?: string
    durationSeconds?: number
  }) {
    const detected = detectFileType(params.buffer)
    if (!detected) {
      throw errors.validation('Format berkas tidak didukung. Gunakan JPG, PNG, WEBP, MP4, MP3, WAV, OGG, atau M4A.')
    }

    const limit = detected.kind === 'VIDEO'
      ? MAX_VIDEO_BYTES
      : detected.kind === 'AUDIO' ? MAX_AUDIO_BYTES : MAX_IMAGE_BYTES
    if (params.buffer.length > limit) {
      throw errors.validation(
        `Ukuran berkas maksimal ${Math.round(limit / 1024 / 1024)} MB untuk ${LABEL_TIPE[detected.kind]}`,
      )
    }

    const filePath = await storage.save(params.buffer, { folder: 'media', extension: detected.extension })

    // Durasi dikirim klien (video & audio sama-sama bisa dibaca elemen media di peramban).
    const duration = detected.kind !== 'IMAGE' && Number.isFinite(params.durationSeconds)
      ? Math.max(1, Math.min(24 * 3600, Math.round(params.durationSeconds!)))
      : null

    const media = await prisma.media.create({
      data: {
        id: newId(),
        organizationId: params.organizationId,
        name: (params.name || params.filename || 'Media').slice(0, 190),
        type: detected.kind,
        mime: detected.mime,
        filePath,
        sizeBytes: params.buffer.length,
        width: detected.width ?? null,
        height: detected.height ?? null,
        durationSeconds: duration,
        uploadedById: params.uploadedById,
      },
    })

    return { ...media, url: storage.publicUrl(media.filePath) }
  },

  async rename(organizationId: string, id: string, name: string) {
    await this.getById(organizationId, id)
    const media = await prisma.media.update({ where: { id }, data: { name } })
    return { ...media, url: storage.publicUrl(media.filePath) }
  },

  /**
   * Hapus media beserta berkasnya.
   * Ditolak bila masih dipakai widget display atau playlist — supaya layar tidak
   * tiba-tiba menampilkan kotak kosong.
   */
  async remove(organizationId: string, id: string) {
    const media = await this.getById(organizationId, id)

    const [widgetCount, playlistCount] = await Promise.all([
      prisma.displayWidget.count({ where: { mediaId: id } }),
      prisma.playlistItem.count({ where: { mediaId: id } }),
    ])

    if (widgetCount + playlistCount > 0) {
      const dipakai = [
        widgetCount ? `${widgetCount} widget display` : null,
        playlistCount ? `${playlistCount} item playlist` : null,
      ].filter(Boolean).join(' dan ')
      throw errors.conflict(ERROR_CODES.CONFLICT, `Media masih dipakai oleh ${dipakai}`)
    }

    await prisma.media.delete({ where: { id } })
    await storage.remove(media.filePath)

    return media
  },
}

export const playlistService = {
  async list(organizationId: string) {
    const playlists = await prisma.playlist.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      include: {
        items: {
          orderBy: { displayOrder: 'asc' },
          include: { media: { select: { id: true, name: true, type: true, filePath: true, durationSeconds: true } } },
        },
      },
    })

    return playlists.map(p => ({
      ...p,
      totalSeconds: p.items.reduce((sum, i) => sum + i.durationSeconds, 0),
      items: p.items.map(i => ({ ...i, media: { ...i.media, url: storage.publicUrl(i.media.filePath) } })),
    }))
  },

  async getById(organizationId: string, id: string) {
    const playlist = await prisma.playlist.findFirst({
      where: { id, organizationId },
      include: {
        items: {
          orderBy: { displayOrder: 'asc' },
          include: { media: { select: { id: true, name: true, type: true, filePath: true, durationSeconds: true } } },
        },
      },
    })
    if (!playlist) throw errors.notFound('Playlist tidak ditemukan')
    return {
      ...playlist,
      items: playlist.items.map(i => ({ ...i, media: { ...i.media, url: storage.publicUrl(i.media.filePath) } })),
    }
  },

  async create(organizationId: string, name: string) {
    const playlist = await prisma.playlist.create({
      data: { id: newId(), organizationId, name },
    })
    return this.getById(organizationId, playlist.id)
  },

  async update(organizationId: string, id: string, input: { name?: string, isActive?: boolean }) {
    await this.getById(organizationId, id)
    await prisma.playlist.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
    })
    return this.getById(organizationId, id)
  },

  /** Ganti seluruh isi playlist sekaligus, seperti penyimpanan field formulir. */
  async replaceItems(
    organizationId: string,
    id: string,
    items: Array<{ mediaId: string, durationSeconds: number }>,
  ) {
    await this.getById(organizationId, id)

    if (items.length) {
      const owned = await prisma.media.count({
        where: { id: { in: items.map(i => i.mediaId) }, organizationId, deletedAt: null },
      })
      if (owned !== new Set(items.map(i => i.mediaId)).size) {
        throw errors.notFound('Ada media yang tidak ditemukan pada organisasi ini')
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.playlistItem.deleteMany({ where: { playlistId: id } })
      if (items.length) {
        await tx.playlistItem.createMany({
          data: items.map((item, index) => ({
            id: newId(),
            playlistId: id,
            mediaId: item.mediaId,
            displayOrder: index + 1,
            durationSeconds: Math.max(1, Math.min(3600, Math.round(item.durationSeconds || 10))),
          })),
        })
      }
    })

    return this.getById(organizationId, id)
  },

  async remove(organizationId: string, id: string) {
    const playlist = await this.getById(organizationId, id)

    const inUse = await prisma.displayWidget.count({ where: { playlistId: id } })
    if (inUse > 0) {
      throw errors.conflict(ERROR_CODES.CONFLICT, `Playlist masih dipakai oleh ${inUse} widget display`)
    }

    await prisma.playlist.delete({ where: { id } })
    return playlist
  },
}
