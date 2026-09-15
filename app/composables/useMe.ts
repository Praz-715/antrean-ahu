import type { ApiResponse } from '#shared/types/api'
import type { Permission } from '#shared/constants/permissions'

export interface MeAssignment {
  id: string
  isDefault: boolean
  queueType: { id: string, code: string, name: string, color: string, icon: string | null }
  counter: { id: string, code: string, name: string } | null
  event: { id: string, name: string, status: string, timezone: string }
}

export interface MeData {
  user: { id: string, name: string, email: string }
  organization: { id: string, name: string, slug: string, logoUrl: string | null, timezone: string } | null
  roles: string[]
  isSuperadmin: boolean
  permissions: string[]
  assignments: MeAssignment[]
}

/**
 * Identitas + permission user yang sedang login.
 * Satu sumber kebenaran untuk gating UI; server tetap memeriksa ulang setiap request.
 */
export function useMe() {
  const me = useState<MeData | null>('antrean:me', () => null)
  const loaded = useState<boolean>('antrean:me-loaded', () => false)

  async function load(force = false): Promise<MeData | null> {
    if (loaded.value && !force) return me.value

    const headers = import.meta.server ? useRequestHeaders(['cookie']) : undefined
    try {
      const res = await $fetch<ApiResponse<MeData | null>>('/api/me', { headers })
      me.value = res.success ? res.data : null
    }
    catch {
      me.value = null
    }
    loaded.value = true
    return me.value
  }

  function reset() {
    me.value = null
    loaded.value = false
  }

  const isLoggedIn = computed(() => !!me.value)
  const isOperator = computed(() => me.value?.roles.includes('OPERATOR') ?? false)

  /** Superadmin melewati seluruh pemeriksaan permission (§57.6). */
  function can(...permissions: Permission[]): boolean {
    if (!me.value) return false
    if (me.value.isSuperadmin) return true
    return permissions.some(p => me.value!.permissions.includes(p))
  }

  /** Halaman awal sesuai role (§52). */
  const homeRoute = computed(() => {
    if (!me.value) return '/login'
    if (me.value.isSuperadmin || me.value.roles.includes('ADMIN') || me.value.roles.includes('VIEWER')) {
      return '/admin/dashboard'
    }
    return '/operator'
  })

  return { me, load, reset, can, isLoggedIn, isOperator, homeRoute }
}
