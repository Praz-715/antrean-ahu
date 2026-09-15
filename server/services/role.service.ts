import { prisma } from '../utils/prisma'
import { errors } from '../utils/response'
import { ERROR_CODES } from '../../shared/constants/errors'
import { newId } from '../utils/id'
import { invalidateAuthContext } from '../utils/context'
import { ALL_PERMISSIONS, ROLE_KEYS } from '../../shared/constants/permissions'

export interface RoleInput {
  name: string
  description?: string | null
  permissions: string[]
}

/**
 * Role kustom per organisasi (§26).
 *
 * Role sistem (SUPERADMIN, ADMIN, OPERATOR, VIEWER) sengaja tidak bisa dihapus atau
 * diganti namanya — sebagian kode dan seed bergantung padanya. Izinnya masih boleh
 * disesuaikan, kecuali SUPERADMIN yang memang melewati seluruh pemeriksaan izin
 * sehingga daftar izinnya tidak punya arti.
 */
export const roleService = {
  async list(organizationId: string) {
    const roles = await prisma.role.findMany({
      where: { OR: [{ organizationId }, { organizationId: null }] },
      orderBy: [{ isSystem: 'desc' }, { key: 'asc' }],
      select: {
        id: true,
        key: true,
        name: true,
        description: true,
        isSystem: true,
        organizationId: true,
        rolePermissions: { select: { permission: { select: { key: true } } } },
        _count: { select: { userRoles: true } },
      },
    })

    return roles.map(role => ({
      id: role.id,
      key: role.key,
      name: role.name,
      description: role.description,
      isSystem: role.isSystem,
      isGlobal: role.organizationId === null,
      /** SUPERADMIN melewati seluruh cek izin, jadi daftar izinnya efektif "semua". */
      bypassesPermissions: role.key === ROLE_KEYS.SUPERADMIN,
      permissions: role.rolePermissions.map(rp => rp.permission.key),
      userCount: role._count.userRoles,
    }))
  },

  async getById(organizationId: string, id: string) {
    const role = await prisma.role.findFirst({
      where: { id, OR: [{ organizationId }, { organizationId: null }] },
      include: { rolePermissions: { select: { permissionId: true } }, _count: { select: { userRoles: true } } },
    })
    if (!role) throw errors.notFound('Role tidak ditemukan')
    return role
  },

  async create(organizationId: string, input: RoleInput) {
    const key = slugKey(input.name)

    const clash = await prisma.role.findFirst({
      where: { key, OR: [{ organizationId }, { organizationId: null }] },
      select: { id: true },
    })
    if (clash) throw errors.conflict(ERROR_CODES.CONFLICT, `Role dengan kode "${key}" sudah ada`)

    const permissionIds = await resolvePermissionIds(input.permissions)
    const id = newId()

    await prisma.role.create({
      data: {
        id,
        organizationId,
        key,
        name: input.name,
        description: input.description ?? null,
        isSystem: false,
        rolePermissions: { create: permissionIds.map(permissionId => ({ permissionId })) },
      },
    })

    return this.list(organizationId).then(roles => roles.find(r => r.id === id)!)
  },

  async update(organizationId: string, id: string, input: Partial<RoleInput>) {
    const role = await this.getById(organizationId, id)

    if (role.organizationId === null && role.isSystem === false) {
      throw errors.forbidden('Role global tidak dapat diubah dari organisasi ini')
    }
    if (role.key === ROLE_KEYS.SUPERADMIN) {
      throw errors.forbidden('Izin SUPERADMIN tidak dapat diubah — role ini melewati seluruh pemeriksaan izin')
    }

    await prisma.$transaction(async (tx) => {
      await tx.role.update({
        where: { id },
        data: {
          // Nama role sistem dikunci supaya tetap dikenali lintas organisasi.
          ...(input.name !== undefined && !role.isSystem ? { name: input.name } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
        },
      })

      if (input.permissions !== undefined) {
        const permissionIds = await resolvePermissionIds(input.permissions)
        await tx.rolePermission.deleteMany({ where: { roleId: id } })
        if (permissionIds.length) {
          await tx.rolePermission.createMany({
            data: permissionIds.map(permissionId => ({ roleId: id, permissionId })),
          })
        }
      }
    })

    /**
     * Konteks izin di-cache per pengguna selama 30 detik. Perubahan izin harus terasa
     * seketika — terutama saat izin DICABUT — jadi cache-nya dibuang seluruhnya.
     */
    invalidateAuthContext()

    return this.list(organizationId).then(roles => roles.find(r => r.id === id)!)
  },

  async remove(organizationId: string, id: string) {
    const role = await this.getById(organizationId, id)

    if (role.isSystem) throw errors.forbidden('Role bawaan sistem tidak dapat dihapus')
    if (role.organizationId !== organizationId) throw errors.forbidden('Role ini bukan milik organisasi Anda')
    if (role._count.userRoles > 0) {
      throw errors.conflict(
        ERROR_CODES.CONFLICT,
        `Role masih dipakai ${role._count.userRoles} pengguna. Pindahkan mereka lebih dulu.`,
      )
    }

    await prisma.role.delete({ where: { id } })
    invalidateAuthContext()

    return { id, name: role.name }
  },
}

/** Ubah nama menjadi kode role: huruf besar, tanpa spasi. */
function slugKey(name: string) {
  return name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60)
}

/** Hanya izin yang ada di katalog yang diterima — kunci asing diabaikan, bukan disimpan. */
async function resolvePermissionIds(keys: string[]) {
  const valid = keys.filter(key => (ALL_PERMISSIONS as string[]).includes(key))
  if (!valid.length) return []

  const rows = await prisma.permission.findMany({
    where: { key: { in: valid } },
    select: { id: true },
  })
  return rows.map(r => r.id)
}
