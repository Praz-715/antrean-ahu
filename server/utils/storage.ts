import { createReadStream } from 'node:fs'
import { mkdir, stat, unlink, writeFile } from 'node:fs/promises'
import { dirname, join, normalize, resolve, sep } from 'node:path'
import { newId } from './id'
import { createLogger } from './logger'

const log = createLogger('storage')

/**
 * Abstraksi penyimpanan berkas (§20).
 *
 * Driver `local` menulis ke direktori pada disk; driver S3/MinIO menyusul tanpa
 * mengubah pemanggil — service selalu lewat modul ini, tidak pernah menyentuh `fs`
 * secara langsung.
 */
export interface SaveOptions {
  /** Sub-direktori logis, mis. 'media'. */
  folder: string
  extension: string
}

function rootDir(): string {
  return resolve(process.cwd(), process.env.STORAGE_LOCAL_PATH || './storage/uploads')
}

export const storage = {
  /** Simpan buffer, kembalikan path relatif yang aman disimpan di database. */
  async save(buffer: Buffer, options: SaveOptions): Promise<string> {
    const now = new Date()
    const relativePath = [
      options.folder,
      String(now.getUTCFullYear()),
      String(now.getUTCMonth() + 1).padStart(2, '0'),
      `${newId()}.${options.extension}`,
    ].join('/')

    const absolute = this.resolve(relativePath)
    await mkdir(dirname(absolute), { recursive: true })
    await writeFile(absolute, buffer)

    return relativePath
  },

  /**
   * Ubah path relatif menjadi path absolut, sambil memastikan hasilnya tetap
   * berada di dalam direktori penyimpanan (menangkal path traversal).
   */
  resolve(relativePath: string): string {
    const root = rootDir()
    const absolute = resolve(join(root, normalize(relativePath)))
    if (absolute !== root && !absolute.startsWith(root + sep)) {
      throw new Error('Path berkas di luar direktori penyimpanan')
    }
    return absolute
  },

  async remove(relativePath: string): Promise<void> {
    try {
      await unlink(this.resolve(relativePath))
    }
    catch (error) {
      // berkas sudah hilang bukan alasan untuk menggagalkan penghapusan basis data
      log.warn('gagal menghapus berkas', { relativePath, message: (error as Error).message })
    }
  },

  async exists(relativePath: string): Promise<boolean> {
    try {
      await stat(this.resolve(relativePath))
      return true
    }
    catch {
      return false
    }
  },

  stream(relativePath: string) {
    return createReadStream(this.resolve(relativePath))
  },

  /** URL yang dipakai klien untuk mengambil berkas. */
  publicUrl(relativePath: string): string {
    const base = process.env.STORAGE_PUBLIC_BASE || '/media'
    return `${base}/${relativePath}`
  },
}
