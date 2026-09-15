import { betterAuth } from 'better-auth'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { ulid } from 'ulid'
import { prisma } from './prisma'

/**
 * Better Auth — email/password untuk admin & operator.
 * Pengunjung TIDAK memakai auth sama sekali; mereka dilacak lewat public_token (§43).
 *
 * Model auth (User/Session/Account/Verification) hidup di prisma/schema.prisma
 * supaya satu migration mengurus seluruh database.
 */
export const auth = betterAuth({
  appName: 'ANTREAN',

  database: prismaAdapter(prisma, { provider: 'mysql' }),

  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
    minPasswordLength: 8,
    maxPasswordLength: 128,
  },

  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 hari
    updateAge: 60 * 60 * 24, // perpanjang tiap hari
    cookieCache: { enabled: true, maxAge: 60 * 5 },
  },

  user: {
    additionalFields: {
      organizationId: { type: 'string', required: false, input: true },
      username: { type: 'string', required: false, input: true },
      phone: { type: 'string', required: false, input: true },
      isActive: { type: 'boolean', required: false, defaultValue: true, input: false },
      lastLoginAt: { type: 'date', required: false, input: false },
    },
  },

  advanced: {
    database: {
      // PK seluruh sistem memakai ULID (§31)
      generateId: () => ulid(),
    },
    useSecureCookies: process.env.NODE_ENV === 'production',
  },

  rateLimit: {
    enabled: true,
    window: 60,
    max: 30,
  },

  databaseHooks: {
    session: {
      create: {
        after: async (session) => {
          await prisma.user.update({
            where: { id: session.userId },
            data: { lastLoginAt: new Date() },
          }).catch(() => {})
        },
      },
    },
  },

  trustedOrigins: [
    process.env.APP_URL || 'http://localhost:3000',
  ],
})

export type Auth = typeof auth
