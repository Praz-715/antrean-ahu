<script setup lang="ts">
import { apiPending, routePending } from './composables/useLoadingState'
import { useUiSettings } from './composables/useUiSettings'

/**
 * Susunan indikator memuat.
 *
 * Tiga lapis dipilih terpisah dari /admin/settings (grup "Tampilan"), jadi yang
 * dirakit di sini adalah sembilan kombinasi — bukan satu "gaya" yang memaksa
 * ketiganya berubah bersamaan. Aturannya:
 *
 *   - Satu komponen bisa dipakai dua sumber sekaligus. Bilah dan spinner
 *     dirender sekali lalu dinyalakan oleh navigasi rute, aktivitas API, atau
 *     keduanya; merender dua bilah yang menumpuk hanya menghasilkan satu bilah
 *     yang berkedip dua kali.
 *   - Overlay TIDAK pernah dinyalakan aktivitas API. Ia menutupi seluruh halaman,
 *     dan menutupinya setiap kali satu tombol ditekan membuat antarmuka terasa
 *     jauh lebih lambat daripada sebenarnya.
 */
const ui = useUiSettings()

const barAktif = computed(() =>
  (ui.value.loadingRoute === 'bar' && routePending.value)
  || (ui.value.loadingApi === 'bar' && apiPending.value),
)

const spinnerAktif = computed(() =>
  (ui.value.loadingRoute === 'spinner' && routePending.value)
  || (ui.value.loadingApi === 'spinner' && apiPending.value),
)

const overlayAktif = computed(() => ui.value.loadingRoute === 'overlay' && routePending.value)

/**
 * Gaya kerangka disampaikan sebagai atribut di elemen `html`, bukan kelas di
 * pembungkus di bawah sini: `USkeleton` tersebar di ±40 tempat, sebagian di dalam
 * modal yang dirender lewat teleport ke luar pohon komponen ini. Atribut di akar
 * dokumen menjangkau semuanya, dan karena ditulis lewat `useHead` ia sudah ada
 * pada HTML pertama — kerangka tidak sempat tergambar dengan gaya yang salah.
 */
useHead(() => ({
  htmlAttrs: { 'data-skeleton': ui.value.loadingSkeleton },
}))
</script>

<template>
  <UApp>
    <!--
      Ketiganya di dalam ClientOnly.

      Sumber datanya murni keadaan klien: `apiPending` hanya naik di klien
      (lihat `useApiLoading`) dan `routePending` hanya terisi oleh navigasi
      sisi-klien. Saat dirender ikut SSR, halaman yang memanggil API di setup-nya
      menghasilkan HTML server `opacity-0` yang bertabrakan dengan klien
      `opacity-100` — peringatan hydration mismatch di setiap pemuatan halaman.

      Tidak ada yang hilang karena dikeluarkan dari SSR: pemuatan pertama bukan
      navigasi sisi-klien, jadi tak satu pun dari ketiganya memang perlu tampil
      pada HTML pertama.
    -->
    <ClientOnly>
      <UiLoadingBar :active="barAktif" />
      <UiLoadingSpinner :active="spinnerAktif" />
      <UiLoadingOverlay :active="overlayAktif" />
    </ClientOnly>

    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
