<script setup lang="ts">
import type { NuxtError } from '#app'

/**
 * Halaman galat sendiri.
 *
 * Tanpa berkas ini Nuxt menampilkan halaman bawaannya yang berbahasa Inggris
 * ("Page not found") — janggal pada antarmuka yang seluruhnya berbahasa Indonesia,
 * dan justru muncul pada saat pengguna paling butuh petunjuk ke mana harus pergi.
 * Halaman ini juga ikut membawa sakelar tema, sama seperti halaman lainnya.
 */
const props = defineProps<{ error: NuxtError }>()

const status = computed(() => props.error?.statusCode ?? 500)

const title = computed(() => {
  if (status.value === 404) return 'Halaman tidak ditemukan'
  if (status.value === 403) return 'Anda tidak punya akses ke halaman ini'
  return 'Terjadi kesalahan'
})

const hint = computed(() => {
  if (status.value === 404) return 'Tautannya mungkin salah, sudah dipindahkan, atau data yang dituju sudah dihapus.'
  if (status.value === 403) return 'Hubungi administrator bila Anda memang seharusnya bisa membuka halaman ini.'
  return 'Coba muat ulang halaman. Bila tetap gagal, laporkan ke administrator beserta waktu kejadiannya.'
})

useHead({ title: title.value })

/**
 * `clearError` wajib dipakai, bukan `navigateTo` biasa: keadaan galat harus
 * dibersihkan lebih dulu, kalau tidak halaman tujuan tetap tertutup layar galat.
 */
function goHome() {
  return clearError({ redirect: '/' })
}
</script>

<template>
  <div class="flex min-h-screen items-center justify-center bg-white p-6 dark:bg-slate-950">
    <UiThemeToggle floating />

    <div class="w-full max-w-md text-center">
      <UIcon v-if="status === 404" name="i-lucide-map-pin-off" class="mx-auto size-14 text-slate-400" />
      <UIcon v-else-if="status === 403" name="i-lucide-shield-alert" class="mx-auto size-14 text-slate-400" />
      <UIcon v-else name="i-lucide-triangle-alert" class="mx-auto size-14 text-slate-400" />

      <p class="queue-number mt-4 text-5xl text-slate-300 dark:text-slate-700">
        {{ status }}
      </p>

      <h1 class="mt-2 text-2xl font-bold tracking-tight">
        {{ title }}
      </h1>

      <p class="mt-2 text-slate-500">
        {{ hint }}
      </p>

      <!-- Pesan teknis hanya berguna bila memang ada; jangan menakuti tanpa isi -->
      <p
        v-if="error?.message && status !== 404"
        class="mt-4 rounded-lg bg-slate-100 p-3 text-left font-mono text-xs text-slate-600 dark:bg-slate-900 dark:text-slate-400"
      >
        {{ error.message }}
      </p>

      <div class="mt-8 flex flex-wrap justify-center gap-2">
        <UButton icon="i-lucide-home" label="Ke beranda" @click="goHome" />
        <UButton
          variant="ghost"
          color="neutral"
          icon="i-lucide-rotate-cw"
          label="Muat ulang"
          @click="() => reloadNuxtApp({ persistState: false })"
        />
      </div>
    </div>
  </div>
</template>
