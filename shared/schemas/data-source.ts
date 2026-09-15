import { z } from 'zod'
import { idSchema } from './common'

export const DATA_SOURCE_TYPES = ['REST', 'JSON', 'DB_READONLY', 'WEBHOOK'] as const
export const DATA_SOURCE_AUTH_TYPES = ['NONE', 'API_KEY', 'BEARER', 'BASIC'] as const
export const HTTP_METHODS = ['GET', 'POST'] as const

/** Jenis yang benar-benar sudah bisa dipanggil hari ini; sisanya masih placeholder skema (§6). */
export const IMPLEMENTED_DATA_SOURCE_TYPES = ['REST', 'JSON'] as const

/**
 * Kredensial per jenis autentikasi.
 *
 * Bentuknya dipisah per jenis supaya validasi bisa memastikan kolom yang perlu
 * memang terisi — "API Key tanpa nama header" adalah konfigurasi yang gagal diam-diam
 * saat dipanggil, bukan saat disimpan.
 */
export const dataSourceCredentialsSchema = z.discriminatedUnion('authType', [
  z.object({ authType: z.literal('NONE') }),
  z.object({
    authType: z.literal('API_KEY'),
    in: z.enum(['header', 'query']).default('header'),
    name: z.string().trim().min(1, 'Nama header/parameter wajib diisi').max(80),
    value: z.string().min(1, 'Nilai API key wajib diisi').max(1000),
  }),
  z.object({
    authType: z.literal('BEARER'),
    token: z.string().min(1, 'Token wajib diisi').max(4000),
  }),
  z.object({
    authType: z.literal('BASIC'),
    username: z.string().min(1, 'Username wajib diisi').max(190),
    password: z.string().min(1, 'Password wajib diisi').max(190),
  }),
])

export type DataSourceCredentials = z.infer<typeof dataSourceCredentialsSchema>

/** Cetakan permintaan: `{lookup}` diganti nilai yang diketik pengunjung. */
export const queryTemplateSchema = z.object({
  /** Nama field pemicu di formulir, mis. `no_rm`. */
  lookupFieldKey: z.string().trim().max(60).optional().nullable(),
  query: z.record(z.string().max(80), z.string().max(500)).default({}),
  body: z.record(z.string().max(80), z.string().max(500)).default({}),
  /** Path di dalam respons yang memuat objek data, mis. `data.patient`. */
  rootPath: z.string().trim().max(190).optional().nullable(),
})

export type QueryTemplate = z.infer<typeof queryTemplateSchema>

export const TRANSFORMS = ['none', 'trim', 'uppercase', 'lowercase', 'capitalize', 'digits', 'date'] as const
export type TransformKey = (typeof TRANSFORMS)[number]

export const mappingSchema = z.object({
  sourcePath: z.string().trim().min(1, 'Path respons wajib diisi').max(255),
  targetFieldKey: z.string().trim().min(1, 'Field tujuan wajib dipilih').max(60),
  transform: z.enum(TRANSFORMS).default('none'),
})

export const createDataSourceSchema = z.object({
  name: z.string().trim().min(2, 'Nama minimal 2 karakter').max(150),
  type: z.enum(DATA_SOURCE_TYPES).default('REST'),
  baseUrl: z.string().trim().min(1, 'URL wajib diisi').max(500),
  httpMethod: z.enum(HTTP_METHODS).default('GET'),
  authType: z.enum(DATA_SOURCE_AUTH_TYPES).default('NONE'),
  credentials: dataSourceCredentialsSchema.optional().nullable(),
  headers: z.record(z.string().max(80), z.string().max(500)).default({}),
  queryTemplate: queryTemplateSchema.optional().nullable(),
  timeoutMs: z.number().int().min(500).max(30000).default(5000),
  isActive: z.boolean().default(true),
  mappings: z.array(mappingSchema).max(50).default([]),
})

export const updateDataSourceSchema = createDataSourceSchema.partial()

export const testDataSourceSchema = z.object({
  lookup: z.string().trim().max(190).default(''),
})

export const attachDataSourceSchema = z.object({
  dataSourceId: idSchema.nullable(),
})

export type CreateDataSourceInput = z.infer<typeof createDataSourceSchema>
export type UpdateDataSourceInput = z.infer<typeof updateDataSourceSchema>
export type MappingInput = z.infer<typeof mappingSchema>
