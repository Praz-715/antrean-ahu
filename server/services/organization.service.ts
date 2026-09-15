import { prisma } from '../utils/prisma'
import { errors } from '../utils/response'
import { invalidateAuthContext } from '../utils/context'

/**
 * Identitas organisasi: nama yang muncul di seluruh antarmuka.
 *
 * Namanya TIDAK disimpan sebagai pengaturan sistem (`system_settings`) melainkan tetap
 * pada kolom `organizations.name`, karena di situlah seluruh bagian aplikasi sudah
 * membacanya — header panel admin, halaman publik, layar display, tiket cetak, dan
 * laporan. Menyalinnya ke tabel pengaturan hanya akan membuat dua sumber kebenaran
 * yang cepat atau lambat berbeda isi.
 */
export const organizationService = {
  async get(organizationId: string) {
    const organization = await prisma.organization.findFirst({
      where: { id: organizationId, deletedAt: null },
      select: { id: true, name: true, slug: true, logoUrl: true, timezone: true },
    })
    if (!organization) throw errors.notFound('Organisasi tidak ditemukan')
    return organization
  },

  /**
   * Ganti nama organisasi.
   *
   * Cache konteks izin ikut dibuang: `/api/me` menyertakan nama organisasi, dan tanpa
   * ini header panel admin masih menampilkan nama lama sampai sesi berikutnya.
   */
  async update(organizationId: string, input: { name?: string, logoUrl?: string | null }) {
    const organization = await this.get(organizationId)

    const data: { name?: string, logoUrl?: string | null } = {}
    if (input.name !== undefined) data.name = input.name.trim()
    if (input.logoUrl !== undefined) data.logoUrl = input.logoUrl?.trim() || null

    if (!Object.keys(data).length) return organization

    const saved = await prisma.organization.update({
      where: { id: organizationId },
      data,
      select: { id: true, name: true, slug: true, logoUrl: true, timezone: true },
    })

    invalidateAuthContext()
    return saved
  },
}
