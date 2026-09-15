<script setup lang="ts">
import type { PublicPageTheme } from '#shared/schemas/public-page'
import { onColor } from '#shared/utils/color'
import { formatDistance, mapsUrl } from '#shared/utils/geo'

/**
 * Layar yang menggantikan halaman antrean ketika pengunjung berada di luar pagar
 * lokasi (§36).
 *
 * Dibuat semirip mungkin dengan halamannya sendiri — logo, judul, dan warna yang
 * sama — supaya pengunjung tahu ia sampai di tempat yang benar dan hanya kurang
 * dekat, bukan salah tautan. Yang paling menentukan di layar ini dua hal: berapa
 * jauh ia sekarang, dan di mana lokasinya.
 */
const props = defineProps<{
  page: {
    title: string
    subtitle: string | null
    logoUrl: string | null
    theme: PublicPageTheme
  }
  organization: { name: string, logoUrl: string | null } | null
  geofence: {
    radiusM: number
    latitude: number | null
    longitude: number | null
    distanceM: number | null
  }
  /** Keadaan permintaan izin lokasi di peramban. */
  status: 'idle' | 'meminta' | 'ditolak' | 'gagal' | 'tidakDidukung'
}>()

const emit = defineEmits<{ share: [] }>()

const cssVars = computed(() => ({
  '--public-primary': props.page.theme.primaryColor,
  '--public-on-primary': onColor(props.page.theme.primaryColor),
}))

const logo = computed(() => props.page.logoUrl || props.organization?.logoUrl || null)

const titik = computed(() =>
  props.geofence.latitude !== null && props.geofence.longitude !== null
    ? { latitude: props.geofence.latitude, longitude: props.geofence.longitude }
    : null)

/** Sudah pernah mencoba tapi masih di luar jangkauan — beda pesan dengan yang belum mencoba. */
const diLuar = computed(() => props.geofence.distanceM !== null)

const pesan = computed(() => {
  if (props.status === 'tidakDidukung') {
    return 'Peramban ini tidak bisa membagikan lokasi. Coba buka dari ponsel Anda.'
  }
  if (props.status === 'ditolak') {
    return 'Izin lokasi ditolak. Nyalakan lagi lewat ikon gembok di bilah alamat, lalu coba sekali lagi.'
  }
  if (props.status === 'gagal') {
    return 'Lokasi Anda tidak dapat dibaca. Pastikan GPS menyala, lalu coba lagi.'
  }
  if (diLuar.value) {
    return `Anda berada sekitar ${formatDistance(props.geofence.distanceM!)} dari lokasi layanan — batasnya ${formatDistance(props.geofence.radiusM)}.`
  }
  return `Halaman ini hanya bisa dibuka dalam jarak ${formatDistance(props.geofence.radiusM)} dari lokasi layanan.`
})
</script>

<template>
  <div class="flex min-h-screen flex-col items-center justify-center px-5 py-12" :style="cssVars">
    <div class="w-full max-w-md text-center">
      <img v-if="logo" :src="logo" alt="" class="mx-auto mb-6 h-14 w-auto object-contain">

      <span
        class="mx-auto flex size-14 items-center justify-center rounded-2xl"
        style="background-color: color-mix(in srgb, var(--public-primary) 12%, transparent); color: var(--public-primary)"
        aria-hidden="true"
      >
        <UIcon :name="diLuar ? 'i-lucide-map-pin-off' : 'i-lucide-map-pin'" class="size-7" />
      </span>

      <h1 class="mt-5 text-2xl font-extrabold tracking-tight">
        {{ diLuar ? 'Anda di luar jangkauan' : 'Verifikasi lokasi' }}
      </h1>
      <p class="mt-1 text-sm text-slate-500">
        {{ page.title }}
      </p>

      <p class="mt-4 text-pretty text-slate-600 dark:text-slate-300">
        {{ pesan }}
      </p>

      <button
        type="button"
        class="mt-7 inline-flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3.5 text-base font-semibold transition-transform hover:scale-[1.01] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
        :style="{ backgroundColor: 'var(--public-primary)', color: 'var(--public-on-primary)', outlineColor: 'var(--public-primary)' }"
        :disabled="status === 'meminta' || status === 'tidakDidukung'"
        @click="emit('share')"
      >
        <UIcon
          :name="status === 'meminta' ? 'i-lucide-loader-circle' : 'i-lucide-crosshair'"
          class="size-5"
          :class="{ 'animate-spin': status === 'meminta' }"
        />
        {{ status === 'meminta' ? 'Membaca lokasi…' : diLuar ? 'Periksa Lokasi Lagi' : 'Bagikan Lokasi Saya' }}
      </button>

      <!--
        Tautan peta bukan pelengkap: pengunjung yang ditolak karena terlalu jauh
        butuh tahu ke mana harus pergi, dan itu satu-satunya jalan keluar dari layar
        ini selain menyerah.
      -->
      <a
        v-if="titik"
        :href="mapsUrl(titik)"
        target="_blank"
        rel="noopener noreferrer"
        class="mt-3 inline-flex items-center justify-center gap-1.5 text-sm font-semibold underline-offset-4 hover:underline"
        :style="{ color: 'var(--public-primary)' }"
      >
        <UIcon name="i-lucide-navigation" class="size-4" />
        Lihat lokasi layanan di peta
      </a>

      <p class="mt-8 text-xs text-slate-400">
        Lokasi Anda hanya dipakai untuk memeriksa jarak dan tidak disimpan.
      </p>
    </div>
  </div>
</template>
