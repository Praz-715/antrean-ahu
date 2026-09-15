import { prisma } from '../utils/prisma'
import { newId } from '../utils/id'
import {
  DEFAULT_SETTINGS,
  SETTINGS_BY_KEY,
  SETTINGS_CATALOG,
  coerceSetting,
  type SettingKey,
  type SettingValue,
  type SettingsMap,
} from '../../shared/constants/settings'

/**
 * Pengaturan sistem (§49).
 *
 * Nilai disimpan per organisasi di `system_settings`, satu baris per kunci, dan
 * dibaca lewat cache pendek: pengaturan ikut dibaca pada jalur panas seperti
 * pembuatan antrean, jadi tidak boleh menambah satu query di tiap permintaan.
 * Cache dibuang eksplisit saat disimpan, bukan menunggu TTL habis.
 */
const CACHE_TTL_MS = 30_000
const cache = new Map<string, { values: SettingsMap, expiresAt: number }>()

export function invalidateSettings(organizationId?: string) {
  if (organizationId) cache.delete(organizationId)
  else cache.clear()
}

/** Pengaturan tingkat event: gabungan nilai organisasi dengan penimpa di `events.settings`. */
export type EventSettings = SettingsMap

export const settingService = {
  /** Seluruh pengaturan organisasi, sudah dilengkapi nilai bawaan untuk kunci yang belum pernah diisi. */
  async getAll(organizationId: string): Promise<SettingsMap> {
    const cached = cache.get(organizationId)
    if (cached && cached.expiresAt > Date.now()) return cached.values

    const rows = await prisma.systemSetting.findMany({
      where: { organizationId },
      select: { key: true, value: true },
    })

    const values = { ...DEFAULT_SETTINGS }
    for (const row of rows) {
      const def = SETTINGS_BY_KEY[row.key]
      if (!def) continue // kunci lama yang definisinya sudah dihapus — abaikan
      values[def.key] = coerceSetting(def, row.value)
    }

    cache.set(organizationId, { values, expiresAt: Date.now() + CACHE_TTL_MS })
    return values
  },

  async get<T extends SettingValue>(organizationId: string, key: SettingKey): Promise<T> {
    const values = await this.getAll(organizationId)
    return values[key] as T
  },

  /**
   * Pengaturan yang berlaku untuk satu event.
   *
   * Sebagian kunci boleh ditimpa per event (lihat `eventOverride` di katalog) supaya
   * satu organisasi bisa menjalankan poliklinik dengan batas panggil ulang berbeda
   * tanpa membuat organisasi baru.
   */
  async forEvent(event: { organizationId: string, settings?: unknown }): Promise<EventSettings> {
    const base = await this.getAll(event.organizationId)
    const overrides = (event.settings ?? {}) as Record<string, unknown>
    if (!overrides || typeof overrides !== 'object') return base

    const merged = { ...base }
    for (const def of SETTINGS_CATALOG) {
      if (!def.eventOverride) continue
      const raw = overrides[def.eventOverride]
      if (raw === undefined || raw === null) continue
      merged[def.key] = coerceSetting(def, raw)
    }
    return merged
  },

  /** Simpan sebagian kunci. Kunci di luar katalog diabaikan, bukan disimpan diam-diam. */
  async update(organizationId: string, userId: string, patch: Record<string, unknown>) {
    const entries = Object.entries(patch)
      .map(([key, raw]) => {
        const def = SETTINGS_BY_KEY[key]
        return def ? { key: def.key, value: coerceSetting(def, raw) } : null
      })
      .filter((e): e is { key: SettingKey, value: SettingValue } => e !== null)

    if (entries.length) {
      await prisma.$transaction(
        entries.map(entry =>
          prisma.systemSetting.upsert({
            where: { organizationId_key: { organizationId, key: entry.key } },
            create: { id: newId(), organizationId, key: entry.key, value: entry.value, updatedById: userId },
            update: { value: entry.value, updatedById: userId },
          }),
        ),
      )
      invalidateSettings(organizationId)
    }

    return { changed: entries.map(e => e.key), values: await this.getAll(organizationId) }
  },

  /** Kembalikan seluruh kunci ke nilai bawaan katalog. */
  async reset(organizationId: string) {
    await prisma.systemSetting.deleteMany({ where: { organizationId } })
    invalidateSettings(organizationId)
    return this.getAll(organizationId)
  },
}
