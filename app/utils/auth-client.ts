import { createAuthClient } from 'better-auth/vue'

/** Klien Better Auth — hanya dipakai untuk aksi sign in / sign out. */
export const authClient = createAuthClient({
  basePath: '/api/auth',
})

export const { signIn, signOut, signUp } = authClient
