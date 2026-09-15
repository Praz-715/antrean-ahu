/**
 * Seed produksi minimal (§51, §52).
 *
 * Berbeda dari `seed.ts` yang mengisi data contoh lengkap, berkas ini hanya menyiapkan
 * yang benar-benar tidak bisa dibuat lewat antarmuka: katalog permission, role sistem,
 * satu organisasi, dan satu akun superadmin pertama.
 *
 * Kata sandi awal DIACAK dan hanya dicetak sekali ke terminal — tidak disimpan di
 * berkas mana pun. Kata sandi tetap yang ikut masuk repositori adalah cara paling
 * umum sebuah instalasi baru langsung bisa dimasuki orang lain.
 *
 * Jalankan: npm run db:seed:prod   (aman diulang; akun yang sudah ada tidak diubah)
 */
import 'dotenv/config'
import { randomBytes } from 'node:crypto'
import { ulid } from 'ulid'
import { prisma } from '../server/utils/prisma'
import { auth } from '../server/utils/auth'
import {
  ALL_PERMISSIONS,
  PERMISSION_GROUPS,
  ROLE_KEYS,
  ROLE_PRESETS,
  type RoleKey,
} from '../shared/constants/permissions'

const ROLE_NAMES: Record<RoleKey, string> = {
  SUPERADMIN: 'Super Administrator',
  ADMIN: 'Administrator',
  OPERATOR: 'Operator Loket',
  VIEWER: 'Pemantau',
}

const ORG_NAME = process.env.SEED_ORG_NAME || 'Organisasi Saya'
const ORG_SLUG = process.env.SEED_ORG_SLUG || 'organisasi'
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL || 'admin@antrean.local'
const ADMIN_NAME = process.env.SEED_ADMIN_NAME || 'Super Admin'
const TIMEZONE = process.env.DEFAULT_TIMEZONE || 'Asia/Jakarta'

/** Kata sandi acak yang tetap mudah diketik ulang sekali saat login pertama. */
function generatePassword() {
  return randomBytes(12).toString('base64url')
}

function groupOf(permissionKey: string): string {
  for (const [group, perms] of Object.entries(PERMISSION_GROUPS)) {
    if ((perms as string[]).includes(permissionKey)) return group
  }
  return 'Lainnya'
}

async function seedPermissions() {
  for (const key of ALL_PERMISSIONS) {
    await prisma.permission.upsert({
      where: { key },
      update: { group: groupOf(key) },
      create: { id: ulid(), key, group: groupOf(key) },
    })
  }
  console.log(`  ✓ ${ALL_PERMISSIONS.length} permission`)
}

async function seedRoles(organizationId: string) {
  const roles: Record<string, string> = {}

  for (const key of Object.values(ROLE_KEYS)) {
    const role = await prisma.role.upsert({
      where: { organizationId_key: { organizationId, key } },
      update: { name: ROLE_NAMES[key], isSystem: true },
      create: { id: ulid(), organizationId, key, name: ROLE_NAMES[key], isSystem: true },
    })
    roles[key] = role.id

    const permissionKeys = ROLE_PRESETS[key]
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } })
    if (permissionKeys.length) {
      const permissions = await prisma.permission.findMany({
        where: { key: { in: permissionKeys as string[] } },
        select: { id: true },
      })
      await prisma.rolePermission.createMany({
        data: permissions.map(p => ({ roleId: role.id, permissionId: p.id })),
      })
    }
  }

  console.log(`  ✓ ${Object.keys(roles).length} role sistem`)
  return roles
}

async function main() {
  console.log('\nSeed produksi ANTREAN\n')

  await seedPermissions()

  const org = await prisma.organization.upsert({
    where: { slug: ORG_SLUG },
    update: {},
    create: {
      id: ulid(),
      name: ORG_NAME,
      slug: ORG_SLUG,
      timezone: TIMEZONE,
    },
  })
  console.log(`  ✓ organisasi "${org.name}"`)

  const roles = await seedRoles(org.id)

  const existing = await prisma.user.findFirst({ where: { email: ADMIN_EMAIL } })
  if (existing) {
    console.log(`  ✓ superadmin ${ADMIN_EMAIL} sudah ada — kata sandinya tidak diubah`)
    console.log('\nSelesai. Tidak ada yang perlu dicatat.\n')
    return
  }

  const password = generatePassword()
  await auth.api.signUpEmail({ body: { email: ADMIN_EMAIL, password, name: ADMIN_NAME } })

  const user = await prisma.user.findFirst({ where: { email: ADMIN_EMAIL } })
  if (!user) throw new Error(`Gagal membuat pengguna ${ADMIN_EMAIL}`)

  await prisma.user.update({
    where: { id: user.id },
    data: {
      name: ADMIN_NAME,
      username: 'superadmin',
      organizationId: org.id,
      isActive: true,
      emailVerified: true,
    },
  })
  await prisma.userRole.deleteMany({ where: { userId: user.id } })
  await prisma.userRole.create({ data: { userId: user.id, roleId: roles[ROLE_KEYS.SUPERADMIN]! } })

  console.log(`  ✓ superadmin ${ADMIN_EMAIL}`)
  console.log(`
────────────────────────────────────────────────────────────
  AKUN SUPERADMIN PERTAMA

  Email        : ${ADMIN_EMAIL}
  Kata sandi   : ${password}

  Kata sandi ini HANYA ditampilkan sekarang dan tidak disimpan
  di berkas mana pun. Catat, lalu segera ganti setelah login.
────────────────────────────────────────────────────────────

Langkah berikutnya ada di docs/DEPLOYMENT.md §4.
`)
}

main()
  .catch((error) => {
    console.error('\nSeed gagal:', error)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
