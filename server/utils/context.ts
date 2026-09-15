import type { H3Event } from 'h3'
import { auth } from './auth'
import { prisma } from './prisma'
import { errors } from './response'
import { ERROR_CODES } from '../../shared/constants/errors'
import { ROLE_KEYS, type Permission } from '../../shared/constants/permissions'
import { SETTING_KEYS } from '../../shared/constants/settings'
import { settingService } from '../services/setting.service'

export interface AuthContext {
  userId: string
  organizationId: string | null
  name: string
  email: string
  isSuperadmin: boolean
  roleKeys: string[]
  permissions: Set<string>
  /** queue type id yang dilayani loket operator (kosong untuk admin non-operator) */
  assignedQueueTypeIds: string[]
  /** Loket tempat operator duduk, bila ada (§28). */
  counterId: string | null
  /** Event pemilik loket tersebut. */
  counterEventId: string | null
}

/**
 * Cache role & permission per pengguna.
 *
 * Menyusun konteks ini butuh beberapa query bersarang, sedangkan isinya jarang
 * berubah. Cache dibuang eksplisit lewat `invalidateAuthContext()` saat pengguna,
 * role, atau penugasannya diubah — jadi perubahan izin tidak menunggu TTL.
 */
const AUTH_CACHE_TTL_MS = 30_000
const authCache = new Map<string, { ctx: AuthContext, expiresAt: number }>()

export function invalidateAuthContext(userId?: string) {
  if (userId) authCache.delete(userId)
  else authCache.clear()
}

/** Ambil sesi + role + permission user. Hasilnya di-cache per request dan per pengguna. */
export async function getAuthContext(event: H3Event): Promise<AuthContext | null> {
  if (event.context.auth !== undefined) return event.context.auth as AuthContext | null

  const session = await auth.api.getSession({ headers: event.headers })
  if (!session?.user) {
    event.context.auth = null
    return null
  }

  /**
   * Batas umur sesi dari pengaturan sistem (§49).
   *
   * Better Auth punya masa berlaku cookie sendiri, tetapi nilainya terkunci saat
   * proses dimulai. Pemeriksaan di sini membuat perubahan "durasi sesi login"
   * langsung berlaku pada sesi yang sudah berjalan, bukan menunggu deploy ulang.
   */
  const organizationId = (session.user as { organizationId?: string | null }).organizationId
  const sessionCreatedAt = session.session?.createdAt
  if (organizationId && sessionCreatedAt) {
    const maxMinutes = Number(await settingService.get(organizationId, SETTING_KEYS.SYSTEM_SESSION_MINUTES))
    const ageMinutes = (Date.now() - new Date(sessionCreatedAt).getTime()) / 60_000
    if (maxMinutes > 0 && ageMinutes > maxMinutes) {
      event.context.auth = null
      return null
    }
  }

  const cached = authCache.get(session.user.id)
  if (cached && cached.expiresAt > Date.now()) {
    event.context.auth = cached.ctx
    return cached.ctx
  }

  const user = await prisma.user.findFirst({
    where: { id: session.user.id, deletedAt: null },
    select: {
      id: true,
      name: true,
      email: true,
      isActive: true,
      organizationId: true,
      userRoles: {
        select: {
          role: {
            select: {
              key: true,
              rolePermissions: { select: { permission: { select: { key: true } } } },
            },
          },
        },
      },
      /**
       * Cakupan layanan operator kini melekat pada LOKET tempat ia duduk (§28),
       * bukan pada daftar penugasan per jenis antrean.
       */
      assignment: {
        select: {
          counter: {
            select: {
              id: true,
              eventId: true,
              services: { select: { queueTypeId: true } },
            },
          },
        },
      },
    },
  })

  if (!user) {
    event.context.auth = null
    return null
  }

  if (!user.isActive) {
    throw errors.badRequest(ERROR_CODES.ACCOUNT_INACTIVE, 'Akun Anda dinonaktifkan. Hubungi administrator.')
  }

  const roleKeys = user.userRoles.map(ur => ur.role.key)
  const permissions = new Set<string>()
  for (const ur of user.userRoles) {
    for (const rp of ur.role.rolePermissions) permissions.add(rp.permission.key)
  }

  const ctx: AuthContext = {
    userId: user.id,
    organizationId: user.organizationId,
    name: user.name,
    email: user.email,
    isSuperadmin: roleKeys.includes(ROLE_KEYS.SUPERADMIN),
    roleKeys,
    permissions,
    assignedQueueTypeIds: user.assignment?.counter.services.map(s => s.queueTypeId) ?? [],
    counterId: user.assignment?.counter.id ?? null,
    counterEventId: user.assignment?.counter.eventId ?? null,
  }

  authCache.set(user.id, { ctx, expiresAt: Date.now() + AUTH_CACHE_TTL_MS })
  event.context.auth = ctx
  return ctx
}

export async function requireAuth(event: H3Event): Promise<AuthContext> {
  const ctx = await getAuthContext(event)
  if (!ctx) throw errors.unauthenticated()
  return ctx
}

/** Superadmin melewati seluruh pemeriksaan permission (§57.6). */
export function can(ctx: AuthContext, permission: Permission): boolean {
  return ctx.isSuperadmin || ctx.permissions.has(permission)
}

export async function requirePermission(event: H3Event, ...permissions: Permission[]): Promise<AuthContext> {
  const ctx = await requireAuth(event)
  const allowed = permissions.some(p => can(ctx, p))
  if (!allowed) throw errors.forbidden()
  return ctx
}

/** Organization aktif milik user; superadmin tanpa organisasi harus menyebut eksplisit. */
export function requireOrganization(ctx: AuthContext): string {
  if (!ctx.organizationId) throw errors.forbidden('Akun Anda belum terhubung ke organisasi manapun')
  return ctx.organizationId
}

