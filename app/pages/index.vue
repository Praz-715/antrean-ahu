<script setup lang="ts">
import { apiFetch } from '../composables/useApi'

definePageMeta({ layout: 'default' })

/**
 * Halaman pangkal (`/`).
 *
 * Isinya ditentukan pengaturan `system.landing`: halaman sambutan seperti semula,
 * daftar seluruh halaman publik yang terbit, atau langsung dialihkan ke satu event.
 * Keputusannya diambil di server lewat satu permintaan — halaman ini tidak membaca
 * pengaturan mentah, jadi tidak ada peluang klien dan server menyimpulkan hal
 * berbeda dari nilai yang sama.
 */
interface LandingPage {
  publishCode: string
  title: string
  subtitle: string | null
  logoUrl: string | null
  backgroundUrl: string | null
  primaryColor: string
  secondaryColor: string
  eventName: string
  isOpen: boolean
  statusMessage: string
  openTime: string | null
  closeTime: string | null
}

interface Landing {
  mode: 'none' | 'directory' | 'event'
  redirect: string | null
  organization: { id: string, name: string, logoUrl: string | null } | null
  pages: LandingPage[]
}

const { data } = await useAsyncData('landing', () => apiFetch<Landing>('/api/public/landing')
  // Halaman pangkal tidak boleh gagal total hanya karena pengaturannya tak terbaca.
  .catch(() => ({ mode: 'none', redirect: null, organization: null, pages: [] }) as Landing))

/**
 * Pengalihan dijalankan saat render server juga, bukan hanya di peramban: kalau
 * ditunda sampai hidrasi, pengunjung sempat melihat halaman sambutan berkedip
 * sebelum berpindah.
 */
if (data.value?.redirect) {
  await navigateTo(data.value.redirect, { replace: true })
}

const daftar = computed(() => (data.value?.mode === 'directory' ? data.value.pages : []))
const namaOrganisasi = computed(() => data.value?.organization?.name ?? 'ANTREAN')

useHead(() => ({
  title: daftar.value.length ? `Layanan ${namaOrganisasi.value}` : 'Beranda',
}))
</script>

<template>
  <div v-if="daftar.length" class="min-h-screen bg-slate-50 dark:bg-slate-950">
    <!-- Daftar halaman publik yang terbit -->
    <header class="border-b border-slate-200 bg-white px-5 py-10 dark:border-slate-800 dark:bg-slate-900">
      <div class="mx-auto flex max-w-5xl flex-col items-center gap-3 text-center">
        <img
          v-if="data?.organization?.logoUrl"
          :src="data.organization.logoUrl"
          alt=""
          class="h-12 w-auto object-contain"
        >
        <h1 class="text-2xl font-extrabold tracking-tight sm:text-3xl">
          {{ namaOrganisasi }}
        </h1>
        <p class="text-slate-500">
          Pilih layanan untuk mengambil nomor antrean.
        </p>
      </div>
    </header>

    <main class="mx-auto max-w-5xl px-5 py-8">
      <ul class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <li v-for="page in daftar" :key="page.publishCode">
          <NuxtLink
            :to="`/p/${page.publishCode}`"
            class="group flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white transition-shadow hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
          >
            <!-- Cuplikan warna & gambar halaman, supaya tiap kartu dikenali sekilas -->
            <div
              class="relative h-24 bg-cover bg-center"
              :style="{
                backgroundColor: page.primaryColor,
                ...(page.backgroundUrl ? { backgroundImage: `url(${page.backgroundUrl})` } : {}),
              }"
            >
              <div
                class="absolute inset-0"
                :style="{ backgroundColor: page.primaryColor, opacity: page.backgroundUrl ? 0.72 : 1 }"
              />
              <img
                v-if="page.logoUrl"
                :src="page.logoUrl"
                alt=""
                class="absolute bottom-3 left-4 h-10 w-auto object-contain"
              >
            </div>

            <div class="flex flex-1 flex-col p-4">
              <p class="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
                {{ page.eventName }}
              </p>
              <h2 class="mt-0.5 text-pretty font-semibold leading-snug">
                {{ page.title }}
              </h2>
              <p v-if="page.subtitle" class="mt-1 line-clamp-2 text-sm text-slate-500">
                {{ page.subtitle }}
              </p>

              <div class="mt-3 flex flex-wrap items-center gap-2">
                <span
                  class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold uppercase tracking-wide"
                  :class="page.isOpen
                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                    : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'"
                >
                  <span
                    class="size-1.5 rounded-full"
                    :class="page.isOpen ? 'bg-emerald-500' : 'bg-slate-400'"
                    aria-hidden="true"
                  />
                  {{ page.isOpen ? 'Buka' : 'Tutup' }}
                </span>
                <span v-if="page.openTime" class="text-xs text-slate-500">
                  {{ page.openTime }}–{{ page.closeTime }}
                </span>
              </div>

              <span
                class="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold transition-transform group-hover:translate-x-0.5"
                :style="{ color: page.primaryColor }"
              >
                Ambil nomor
                <UIcon name="i-lucide-arrow-right" class="size-4" />
              </span>
            </div>
          </NuxtLink>
        </li>
      </ul>
    </main>

    <footer class="pb-10 text-center text-xs text-slate-400">
      Ditenagai <span class="font-semibold">ANTREAN</span>
    </footer>
  </div>

  <div v-else class="flex min-h-screen items-center justify-center p-6">
    <!-- Halaman sambutan bawaan -->
    <div class="text-center">
      <h1 class="text-4xl font-extrabold tracking-tight">
        ANTREAN
      </h1>
      <p class="mt-2 text-slate-500">
        Kelola Antrean. Layani Lebih Cepat.
      </p>
      <UButton to="/login" class="mt-6" size="lg">
        Masuk
      </UButton>
    </div>
  </div>
</template>
