import { apiFetch } from './useApi'
import { DEFAULT_SETTINGS, type SettingKey, type SettingValue, type SettingsMap } from '#shared/constants/settings'

/**
 * Pengaturan sistem untuk sisi klien (§49).
 *
 * Dimuat sekali lalu dibagikan lewat `useState`, karena beberapa halaman hanya
 * membutuhkannya untuk mengisi nilai awal formulir. Kegagalan dianggap bukan
 * masalah dan jatuh ke nilai bawaan: halaman seperti "Jenis Antrean" boleh dibuka
 * pengguna yang tidak punya izin melihat pengaturan, dan itu tidak boleh
 * memunculkan pesan gagal yang membingungkan.
 */
export function useSettings() {
  const values = useState<SettingsMap>('antrean:settings', () => ({ ...DEFAULT_SETTINGS }))
  const loaded = useState<boolean>('antrean:settings-loaded', () => false)
  const pending = useState<boolean>('antrean:settings-pending', () => false)

  async function load(force = false) {
    if (loaded.value && !force) return values.value
    pending.value = true
    try {
      values.value = await apiFetch<SettingsMap>('/api/admin/settings')
      loaded.value = true
    }
    catch {
      values.value = { ...DEFAULT_SETTINGS }
    }
    finally {
      pending.value = false
    }
    return values.value
  }

  function get<T extends SettingValue>(key: SettingKey): T {
    return (values.value[key] ?? DEFAULT_SETTINGS[key]) as T
  }

  return { values, loaded, pending, load, get }
}
