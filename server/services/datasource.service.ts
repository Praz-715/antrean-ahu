import type { Prisma } from '../../generated/prisma/client'
import { prisma } from '../utils/prisma'
import { errors } from '../utils/response'
import { ERROR_CODES } from '../../shared/constants/errors'
import { newId } from '../utils/id'
import { encryptJson, decryptJson } from '../utils/crypto'
import { safeFetch } from '../utils/ssrf'
import { createLogger } from '../utils/logger'
import {
  IMPLEMENTED_DATA_SOURCE_TYPES,
  type CreateDataSourceInput,
  type DataSourceCredentials,
  type MappingInput,
  type QueryTemplate,
  type TransformKey,
  type UpdateDataSourceInput,
} from '../../shared/schemas/data-source'

const log = createLogger('datasource')

/** Versi kunci enkripsi yang dipakai saat menulis. Naikkan saat kunci dirotasi. */
const CURRENT_KEY_VERSION = 1

/**
 * Sumber data eksternal untuk mengisi formulir otomatis (§6).
 *
 * Dua hal yang dijaga ketat di sini:
 *
 * 1. **Kredensial tidak pernah keluar.** Disimpan terenkripsi AES-256-GCM dan tidak
 *    pernah ikut pada respons API mana pun — yang dikembalikan hanya penanda bahwa
 *    kredensialnya ada.
 * 2. **Pengunjung tidak pernah melihat respons mentah.** Hanya nilai yang benar-benar
 *    dipetakan ke field formulir yang dikirim balik. Tanpa aturan itu, satu endpoint
 *    rumah sakit yang mengembalikan seluruh rekam medis akan bocor utuh ke publik
 *    hanya karena satu field dipetakan.
 */
export const datasourceService = {
  async list(organizationId: string) {
    const sources = await prisma.dataSource.findMany({
      where: { organizationId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      include: {
        mappings: { orderBy: { targetFieldKey: 'asc' } },
        _count: { select: { formDefinitions: true } },
      },
    })

    return sources.map(toPublicShape)
  },

  async getById(organizationId: string, id: string) {
    const source = await prisma.dataSource.findFirst({
      where: { id, organizationId, deletedAt: null },
      include: { mappings: { orderBy: { targetFieldKey: 'asc' } }, _count: { select: { formDefinitions: true } } },
    })
    if (!source) throw errors.notFound('Sumber data tidak ditemukan')
    return source
  },

  async getPublic(organizationId: string, id: string) {
    return toPublicShape(await this.getById(organizationId, id))
  },

  async create(organizationId: string, input: CreateDataSourceInput) {
    assertSupportedType(input.type)

    const id = newId()
    await prisma.$transaction(async (tx) => {
      await tx.dataSource.create({
        data: {
          id,
          organizationId,
          name: input.name,
          type: input.type,
          baseUrl: input.baseUrl,
          httpMethod: input.httpMethod,
          authType: input.authType,
          credentialsCipher: encryptCredentials(input.authType, input.credentials),
          keyVersion: CURRENT_KEY_VERSION,
          headers: input.headers as never,
          queryTemplate: (input.queryTemplate ?? {}) as never,
          timeoutMs: input.timeoutMs,
          isActive: input.isActive,
        },
      })
      await writeMappings(tx, id, input.mappings ?? [])
    })

    return this.getPublic(organizationId, id)
  },

  async update(organizationId: string, id: string, input: UpdateDataSourceInput) {
    const existing = await this.getById(organizationId, id)
    if (input.type) assertSupportedType(input.type)

    const authType = input.authType ?? existing.authType

    await prisma.$transaction(async (tx) => {
      await tx.dataSource.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.type !== undefined ? { type: input.type } : {}),
          ...(input.baseUrl !== undefined ? { baseUrl: input.baseUrl } : {}),
          ...(input.httpMethod !== undefined ? { httpMethod: input.httpMethod } : {}),
          ...(input.authType !== undefined ? { authType: input.authType } : {}),
          ...(input.headers !== undefined ? { headers: input.headers as never } : {}),
          ...(input.queryTemplate !== undefined ? { queryTemplate: (input.queryTemplate ?? {}) as never } : {}),
          ...(input.timeoutMs !== undefined ? { timeoutMs: input.timeoutMs } : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
          /**
           * Kredensial hanya ditimpa bila memang dikirim ulang. Formulir admin tidak
           * pernah menampilkan nilai lamanya, jadi menyimpan perubahan nama saja
           * tidak boleh diam-diam menghapus API key yang sudah bekerja.
           */
          ...(input.credentials !== undefined
            ? { credentialsCipher: encryptCredentials(authType, input.credentials), keyVersion: CURRENT_KEY_VERSION }
            : {}),
          // Ganti jenis auth tanpa kredensial baru: yang lama sudah tidak relevan.
          ...(input.authType !== undefined && input.credentials === undefined && input.authType !== existing.authType
            ? { credentialsCipher: null }
            : {}),
        },
      })

      if (input.mappings !== undefined) await writeMappings(tx, id, input.mappings)
    })

    return this.getPublic(organizationId, id)
  },

  async remove(organizationId: string, id: string) {
    const source = await this.getById(organizationId, id)

    // Formulir yang masih memakainya dilepaskan dulu supaya tidak menunjuk ke sumber mati.
    await prisma.$transaction([
      prisma.formDefinition.updateMany({ where: { dataSourceId: id }, data: { dataSourceId: null } }),
      prisma.dataSource.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } }),
    ])

    return { id, name: source.name }
  },

  /**
   * Uji koneksi dari panel admin (§6).
   *
   * Mengembalikan cuplikan respons mentah — admin butuh itu untuk menyusun pemetaan.
   * Jalur ini hanya bisa dicapai pengguna ber-izin `integration.manage`, berbeda dengan
   * jalur autofill publik yang tidak pernah membocorkan respons apa pun.
   */
  async test(organizationId: string, id: string, lookup: string) {
    const source = await this.getById(organizationId, id)

    const started = Date.now()
    try {
      const { response, parsed } = await callSource(source, lookup)
      const mapped = applyMappings(parsed, source.mappings, readRootPath(source.queryTemplate))

      return {
        ok: response.ok,
        status: response.status,
        durationMs: response.durationMs,
        addresses: response.addresses,
        truncated: response.truncated,
        preview: response.bodyText.slice(0, 4000),
        mapped,
        unmappedPaths: source.mappings
          .filter(m => mapped[m.targetFieldKey] === undefined)
          .map(m => m.sourcePath),
      }
    }
    catch (error) {
      return {
        ok: false,
        status: 0,
        durationMs: Date.now() - started,
        addresses: [],
        truncated: false,
        preview: '',
        mapped: {},
        unmappedPaths: [],
        error: (error as Error).message,
      }
    }
  },

  /**
   * Autofill untuk halaman publik.
   *
   * Hanya field yang benar-benar ada di formulir aktif yang dikembalikan; kunci lain
   * dibuang meski ada di pemetaan. Ini pertahanan lapis kedua kalau pemetaan salah
   * ketik atau formulirnya berubah.
   */
  async autofill(params: { dataSourceId: string, lookup: string, allowedFieldKeys: string[] }) {
    const source = await prisma.dataSource.findFirst({
      where: { id: params.dataSourceId, deletedAt: null },
      include: { mappings: true },
    })
    if (!source) throw errors.notFound('Sumber data tidak ditemukan')
    if (!source.isActive) {
      throw errors.badRequest(ERROR_CODES.DATA_SOURCE_DISABLED, 'Integrasi sedang dinonaktifkan')
    }

    const { response, parsed } = await callSource(source, params.lookup)

    if (!response.ok) {
      if (response.status === 404) {
        throw errors.badRequest(ERROR_CODES.AUTOFILL_NOT_FOUND, 'Data tidak ditemukan')
      }
      log.warn('sumber data membalas gagal', { id: source.id, status: response.status })
      throw errors.badRequest(ERROR_CODES.DATA_SOURCE_UNREACHABLE, 'Sumber data sedang tidak dapat diakses')
    }

    const mapped = applyMappings(parsed, source.mappings, readRootPath(source.queryTemplate))
    const allowed = new Set(params.allowedFieldKeys)
    const values = Object.fromEntries(Object.entries(mapped).filter(([key]) => allowed.has(key)))

    if (!Object.keys(values).length) {
      throw errors.badRequest(ERROR_CODES.AUTOFILL_NOT_FOUND, 'Data tidak ditemukan')
    }

    return values
  },
}

// ------------------------------------------------------------------
// Internal
// ------------------------------------------------------------------

type SourceWithMappings = Awaited<ReturnType<typeof datasourceService.getById>>
type AnySource = {
  id: string
  baseUrl: string
  httpMethod: string
  authType: string
  credentialsCipher: Uint8Array | null
  headers: unknown
  queryTemplate: unknown
  timeoutMs: number
  mappings: Array<{ sourcePath: string, targetFieldKey: string, transform: string | null }>
}

function assertSupportedType(type: string) {
  if (!(IMPLEMENTED_DATA_SOURCE_TYPES as readonly string[]).includes(type)) {
    throw errors.validation(
      `Jenis sumber data "${type}" belum didukung. Saat ini tersedia REST dan JSON.`,
    )
  }
}

/** Prisma 7 mengharapkan Uint8Array untuk kolom Bytes, bukan Buffer. */
function encryptCredentials(authType: string, credentials?: DataSourceCredentials | null): Uint8Array<ArrayBuffer> | null {
  if (authType === 'NONE' || !credentials) return null
  // Salin ke ArrayBuffer baru: tipe Bytes Prisma menolak view di atas buffer bersama.
  const cipher = encryptJson(credentials)
  const bytes = new Uint8Array(cipher.byteLength)
  bytes.set(cipher)
  return bytes
}

/** Bentuk yang aman dikirim ke klien: tanpa cipher, hanya penanda ada/tidaknya kredensial. */
function toPublicShape(source: SourceWithMappings) {
  const { credentialsCipher, ...rest } = source
  return {
    ...rest,
    hasCredentials: !!credentialsCipher,
    headers: (source.headers ?? {}) as Record<string, string>,
    queryTemplate: (source.queryTemplate ?? {}) as QueryTemplate,
  }
}

async function writeMappings(tx: Prisma.TransactionClient, dataSourceId: string, mappings: MappingInput[]) {
  await tx.dataSourceMapping.deleteMany({ where: { dataSourceId } })
  if (!mappings.length) return
  await tx.dataSourceMapping.createMany({
    data: mappings.map(m => ({
      id: newId(),
      dataSourceId,
      sourcePath: m.sourcePath,
      targetFieldKey: m.targetFieldKey,
      transform: m.transform === 'none' ? null : m.transform,
    })),
  })
}

function readRootPath(queryTemplate: unknown): string | null {
  const template = (queryTemplate ?? {}) as QueryTemplate
  return template.rootPath?.trim() || null
}

/** Ganti `{lookup}` pada teks apa pun dengan nilai yang diketik pengunjung. */
function fillTemplate(text: string, lookup: string) {
  return text.replaceAll('{lookup}', encodeURIComponent(lookup))
}

/** Susun dan kirim permintaan ke sumber data. */
async function callSource(source: AnySource, lookup: string) {
  const template = (source.queryTemplate ?? {}) as QueryTemplate
  const credentials = source.credentialsCipher
    ? decryptJson<DataSourceCredentials>(source.credentialsCipher)
    : null

  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...((source.headers ?? {}) as Record<string, string>),
  }

  const url = new URL(fillTemplate(source.baseUrl, lookup))
  for (const [key, value] of Object.entries(template.query ?? {})) {
    url.searchParams.set(key, fillTemplate(value, lookup).replace(/%2F/gi, '/'))
  }

  if (credentials) applyAuth(credentials, headers, url)

  let body: string | null = null
  if (source.httpMethod === 'POST') {
    const payload = Object.fromEntries(
      Object.entries(template.body ?? {}).map(([key, value]) => [key, decodeURIComponent(fillTemplate(value, lookup))]),
    )
    body = JSON.stringify(payload)
    headers['Content-Type'] = 'application/json'
  }

  const response = await safeFetch(url.toString(), {
    method: source.httpMethod,
    headers,
    body,
    timeoutMs: source.timeoutMs,
  })

  let parsed: unknown = null
  if (response.bodyText.trim()) {
    try {
      parsed = JSON.parse(response.bodyText)
    }
    catch {
      throw errors.badRequest(
        ERROR_CODES.DATA_SOURCE_INVALID_RESPONSE,
        'Respons sumber data bukan JSON yang valid',
      )
    }
  }

  return { response, parsed }
}

function applyAuth(credentials: DataSourceCredentials, headers: Record<string, string>, url: URL) {
  switch (credentials.authType) {
    case 'API_KEY':
      if (credentials.in === 'query') url.searchParams.set(credentials.name, credentials.value)
      else headers[credentials.name] = credentials.value
      break
    case 'BEARER':
      headers.Authorization = `Bearer ${credentials.token}`
      break
    case 'BASIC':
      headers.Authorization = `Basic ${Buffer.from(`${credentials.username}:${credentials.password}`).toString('base64')}`
      break
    case 'NONE':
      break
  }
}

/**
 * Ambil nilai dari JSON dengan path bertitik: `data.patient.name`, `items[0].id`.
 * Ditulis sendiri, bukan memakai eval atau pustaka besar, karena path-nya berasal
 * dari input admin dan harus tetap tidak berbahaya.
 */
export function readPath(source: unknown, path: string): unknown {
  const segments = path
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .map(s => s.trim())
    .filter(Boolean)

  let current: unknown = source
  for (const segment of segments) {
    if (current === null || current === undefined) return undefined
    if (Array.isArray(current)) {
      const index = Number(segment)
      if (!Number.isInteger(index)) return undefined
      current = current[index]
      continue
    }
    if (typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[segment]
  }
  return current
}

export function applyTransform(value: unknown, transform: TransformKey | string | null): string | number | boolean | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'boolean') return value
  if (typeof value === 'object') return JSON.stringify(value)

  const text = String(value)
  switch (transform) {
    case 'trim': return text.trim()
    case 'uppercase': return text.toUpperCase()
    case 'lowercase': return text.toLowerCase()
    case 'capitalize':
      return text.toLowerCase().replace(/(^|\s)\p{L}/gu, c => c.toUpperCase())
    case 'digits': return text.replace(/\D/g, '')
    case 'date': {
      const parsed = new Date(text)
      return Number.isNaN(parsed.getTime()) ? text : parsed.toISOString().slice(0, 10)
    }
    default:
      return typeof value === 'number' ? value : text
  }
}

export function applyMappings(
  parsed: unknown,
  mappings: Array<{ sourcePath: string, targetFieldKey: string, transform: string | null }>,
  rootPath: string | null,
) {
  const root = rootPath ? readPath(parsed, rootPath) : parsed
  const result: Record<string, string | number | boolean> = {}

  for (const mapping of mappings) {
    const raw = readPath(root, mapping.sourcePath)
    const value = applyTransform(raw, mapping.transform)
    if (value !== null && value !== '') result[mapping.targetFieldKey] = value
  }

  return result
}
