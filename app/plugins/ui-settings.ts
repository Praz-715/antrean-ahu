import { normalizeUiSettings, useUiSettings } from '../composables/useUiSettings'
import type { ApiResponse } from '#shared/types/api'
import type { UiSettings } from '../composables/useUiSettings'

/**
 * Muat pilihan tampilan satu kali saat SSR.
 *
 * Universal, bukan `.client`: nilainya harus sudah ada pada HTML pertama supaya
 * indikator memuat tidak berganti gaya di depan mata pengguna setelah hidrasi.
 * `useState` yang diisi di sini ikut terbawa ke klien lewat payload, jadi klien
 * tidak meminta apa pun lagi.
 *
 * Memakai `$fetch` biasa, BUKAN `apiFetch`: pembungkus itu menaikkan penghitung
 * `apiPending` di setiap permintaan, dan permintaan yang tugasnya menentukan
 * bentuk indikator memuat justru akan menyalakan indikator itu sendiri pada tiap
 * pemuatan halaman.
 *
 * Kegagalannya sengaja ditelan: nilai bawaan sudah benar, dan halaman tidak boleh
 * gagal terbuka hanya karena pilihan kosmetik tidak bisa dibaca.
 */
export default defineNuxtPlugin(async () => {
  if (!import.meta.server) return

  const settings = useUiSettings()
  try {
    const res = await $fetch<ApiResponse<UiSettings>>('/api/public/ui')
    if (res?.success) settings.value = normalizeUiSettings(res.data)
  }
  catch {
    // biarkan nilai bawaan
  }
})
