/**
 * Seed pengembangan ANTREAN (§51).
 *
 * ⚠️  PERINGATAN: password di bawah hanya untuk DEVELOPMENT.
 *     Wajib diganti sebelum sistem dipakai sungguhan.
 *
 * Jalankan: npm run db:seed   (aman diulang, idempoten)
 */
import 'dotenv/config'
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

const DEV_PASSWORD = 'password123'

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

async function seedOrganization() {
  const org = await prisma.organization.upsert({
    where: { slug: 'demo-organization' },
    update: {},
    create: {
      id: ulid(),
      name: 'Demo Organization',
      slug: 'demo-organization',
      timezone: 'Asia/Jakarta',
      settings: {
        defaultQueuePadding: 3,
        recallLimit: 3,
        voiceEnabled: true,
        voiceLanguage: 'id-ID',
      },
    },
  })
  console.log(`  ✓ organization: ${org.name}`)
  return org
}

const ROLE_NAMES: Record<RoleKey, string> = {
  SUPERADMIN: 'Super Admin',
  ADMIN: 'Administrator',
  OPERATOR: 'Operator',
  VIEWER: 'Pengamat',
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

async function ensureUser(params: {
  email: string
  name: string
  username: string
  organizationId: string
  roleId: string
  phone?: string
}) {
  let user = await prisma.user.findFirst({ where: { email: params.email } })

  if (!user) {
    await auth.api.signUpEmail({
      body: { email: params.email, password: DEV_PASSWORD, name: params.name },
    })
    user = await prisma.user.findFirst({ where: { email: params.email } })
    if (!user) throw new Error(`Gagal membuat user ${params.email}`)
  }

  user = await prisma.user.update({
    where: { id: user.id },
    data: {
      name: params.name,
      username: params.username,
      phone: params.phone ?? null,
      organizationId: params.organizationId,
      isActive: true,
      emailVerified: true,
    },
  })

  await prisma.userRole.deleteMany({ where: { userId: user.id } })
  await prisma.userRole.create({ data: { userId: user.id, roleId: params.roleId } })

  return user
}

async function seedEvent(organizationId: string) {
  const event = await prisma.event.upsert({
    where: { organizationId_slug: { organizationId, slug: 'demo-service' } },
    update: {},
    create: {
      id: ulid(),
      organizationId,
      name: 'Demo Service',
      slug: 'demo-service',
      description: 'Event contoh untuk mencoba alur antrean dari ujung ke ujung.',
      status: 'OPEN',
      timezone: 'Asia/Jakarta',
      allowFinishAfterClose: true,
      branding: { primaryColor: '#1b5cf5', secondaryColor: '#0f172a' },
      settings: { recallLimit: 3, estimateEnabled: true },
    },
  })

  // Jam layanan: Senin–Sabtu 08:00–16:00, Minggu tutup
  for (let day = 0; day <= 6; day++) {
    const isClosed = day === 0
    const existing = await prisma.eventSchedule.findFirst({
      where: { eventId: event.id, dayOfWeek: day, overrideDate: null },
    })
    if (existing) {
      await prisma.eventSchedule.update({
        where: { id: existing.id },
        data: { openTime: '08:00', closeTime: '16:00', isClosed },
      })
    }
    else {
      await prisma.eventSchedule.create({
        data: { id: ulid(), eventId: event.id, dayOfWeek: day, openTime: '08:00', closeTime: '16:00', isClosed },
      })
    }
  }

  console.log(`  ✓ event: ${event.name} (${event.status})`)
  return event
}

async function seedQueueTypes(eventId: string) {
  const definitions = [
    { code: 'A', name: 'Pelayanan Umum', prefix: 'A', color: '#1b5cf5', icon: 'i-lucide-users', order: 1 },
    { code: 'B', name: 'Pelayanan Khusus', prefix: 'B', color: '#7c3aed', icon: 'i-lucide-star', order: 2 },
    { code: 'C', name: 'Informasi', prefix: 'C', color: '#0d9488', icon: 'i-lucide-info', order: 3 },
  ]

  const result = []
  for (const def of definitions) {
    const qt = await prisma.queueType.upsert({
      where: { eventId_code: { eventId, code: def.code } },
      update: { name: def.name, color: def.color, icon: def.icon, displayOrder: def.order },
      create: {
        id: ulid(),
        eventId,
        code: def.code,
        name: def.name,
        prefix: def.prefix,
        startingNumber: 1,
        numberFormat: '{prefix}{seq}',
        padding: 3,
        color: def.color,
        icon: def.icon,
        displayOrder: def.order,
        estServiceSeconds: 480,
      },
    })
    result.push(qt)
  }
  console.log(`  ✓ ${result.length} jenis antrean: ${result.map(r => r.code).join(', ')}`)
  return result
}

/**
 * Loket beserta layanan yang dilayaninya (§12, §28).
 *
 * Layanan melekat pada loket, bukan pada operator: menambah layanan di sini
 * otomatis berlaku bagi siapa pun yang duduk di loket itu. Loket 3 sengaja
 * melayani DUA layanan sekaligus, supaya bilah pemilih layanan pada panel operator
 * ikut teruji.
 */
async function seedCounters(eventId: string, queueTypes: Array<{ id: string, code: string }>) {
  const byCode = new Map(queueTypes.map(t => [t.code, t.id]))
  const defs = [
    { code: 'L1', name: 'Loket 1', order: 1, services: ['A'] },
    { code: 'L2', name: 'Loket 2', order: 2, services: ['B'] },
    { code: 'L3', name: 'Loket 3', order: 3, services: ['A', 'C'] },
  ]

  const counters = []
  for (const def of defs) {
    const counter = await prisma.counter.upsert({
      where: { eventId_code: { eventId, code: def.code } },
      update: { name: def.name, displayOrder: def.order },
      create: { id: ulid(), eventId, code: def.code, name: def.name, displayOrder: def.order },
    })

    const queueTypeIds = def.services.map(code => byCode.get(code)).filter((id): id is string => !!id)
    await prisma.counterService.deleteMany({ where: { counterId: counter.id } })
    if (queueTypeIds.length) {
      await prisma.counterService.createMany({
        data: queueTypeIds.map((queueTypeId, index) => ({
          id: ulid(),
          counterId: counter.id,
          queueTypeId,
          displayOrder: index,
        })),
      })
    }

    counters.push({ ...counter, services: def.services })
  }

  console.log(`  ✓ ${counters.length} loket beserta layanannya`)
  return counters
}

async function seedForm(eventId: string) {
  let form = await prisma.formDefinition.findFirst({ where: { eventId, name: 'Form Pendaftaran' } })
  if (!form) {
    form = await prisma.formDefinition.create({
      data: {
        id: ulid(),
        eventId,
        name: 'Form Pendaftaran',
        description: 'Data minimal yang diisi pengunjung sebelum mengambil nomor.',
        isActive: true,
      },
    })
  }

  const fields = [
    { key: 'full_name', label: 'Nama Lengkap', type: 'TEXT' as const, required: true, placeholder: 'Nama sesuai identitas', order: 1 },
    { key: 'phone', label: 'Nomor HP', type: 'PHONE' as const, required: true, placeholder: '08xxxxxxxxxx', order: 2 },
    { key: 'purpose', label: 'Keperluan', type: 'TEXTAREA' as const, required: false, placeholder: 'Ceritakan singkat keperluan Anda', order: 3 },
  ]

  for (const f of fields) {
    await prisma.formField.upsert({
      where: { formDefinitionId_key: { formDefinitionId: form.id, key: f.key } },
      update: { label: f.label, type: f.type, isRequired: f.required, placeholder: f.placeholder, displayOrder: f.order },
      create: {
        id: ulid(),
        formDefinitionId: form.id,
        key: f.key,
        label: f.label,
        type: f.type,
        isRequired: f.required,
        placeholder: f.placeholder,
        displayOrder: f.order,
      },
    })
  }

  console.log(`  ✓ form "${form.name}" dengan ${fields.length} field`)
  return form
}

async function seedPublicPage(eventId: string, appUrl: string) {
  const publishCode = 'demo2026'
  const page = await prisma.publicPage.upsert({
    where: { publishCode },
    update: { isPublished: true },
    create: {
      id: ulid(),
      eventId,
      publishCode,
      slug: 'demo-antrean',
      title: 'Demo Organization',
      subtitle: 'Silakan ambil nomor antrean',
      description: 'Halaman contoh pengambilan antrean.',
      theme: { primaryColor: '#1b5cf5', mode: 'light' },
      isPublished: true,
      maxPerIpPerDay: 20,
    },
  })

  const target = `${appUrl}/p/${publishCode}`
  const existingQr = await prisma.qrCode.findFirst({ where: { publicPageId: page.id, isActive: true } })
  if (!existingQr) {
    await prisma.qrCode.create({
      data: { id: ulid(), publicPageId: page.id, code: publishCode, targetUrl: target, version: 1, isActive: true },
    })
  }

  console.log(`  ✓ public page: ${target}`)
  return page
}

async function main() {
  const appUrl = process.env.APP_URL || 'http://localhost:3000'
  console.log('\n🌱 Seeding ANTREAN…\n')

  await seedPermissions()
  const org = await seedOrganization()
  const roles = await seedRoles(org.id)

  const superadmin = await ensureUser({
    email: 'superadmin@antrean.local',
    name: 'Super Admin',
    username: 'superadmin',
    organizationId: org.id,
    roleId: roles[ROLE_KEYS.SUPERADMIN]!,
  })
  const operator1 = await ensureUser({
    email: 'operator1@antrean.local',
    name: 'Operator Satu',
    username: 'operator1',
    organizationId: org.id,
    roleId: roles[ROLE_KEYS.OPERATOR]!,
  })
  const operator2 = await ensureUser({
    email: 'operator2@antrean.local',
    name: 'Operator Dua',
    username: 'operator2',
    organizationId: org.id,
    roleId: roles[ROLE_KEYS.OPERATOR]!,
  })
  console.log('  ✓ 3 user (superadmin, operator1, operator2)')

  const event = await seedEvent(org.id)
  const queueTypes = await seedQueueTypes(event.id)
  const counters = await seedCounters(event.id, queueTypes)
  await seedForm(event.id)
  await seedPublicPage(event.id, appUrl)

  /**
   * Penempatan operator: satu operator duduk di satu loket (§28).
   * Layanannya tidak disebut di sini — itu urusan loket.
   */
  const placements = [
    { user: operator1, counter: counters[0]! },
    { user: operator2, counter: counters[1]! },
  ]
  for (const p of placements) {
    await prisma.operatorAssignment.upsert({
      where: { userId: p.user.id },
      update: { counterId: p.counter.id },
      create: { id: ulid(), userId: p.user.id, counterId: p.counter.id },
    })
  }
  console.log(`  ✓ ${placements.length} operator ditempatkan di loket`)

  console.log(`
─────────────────────────────────────────────
  Akun demo (DEVELOPMENT ONLY)
─────────────────────────────────────────────
  superadmin@antrean.local   ${DEV_PASSWORD}
  operator1@antrean.local    ${DEV_PASSWORD}   → ${counters[0]!.name} (layanan ${counters[0]!.services.join(', ')})
  operator2@antrean.local    ${DEV_PASSWORD}   → ${counters[1]!.name} (layanan ${counters[1]!.services.join(', ')})

  ⚠️  GANTI SELURUH PASSWORD DI ATAS sebelum dipakai di lingkungan nyata.

  Halaman publik : ${appUrl}/p/demo2026
  Login          : ${appUrl}/login
─────────────────────────────────────────────
`)
  void superadmin
}

main()
  .then(async () => { await prisma.$disconnect() })
  .catch(async (error) => {
    console.error('\n❌ Seed gagal:', error)
    await prisma.$disconnect()
    process.exit(1)
  })
