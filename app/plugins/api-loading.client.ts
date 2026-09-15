import { apiPending } from '../composables/useApiLoading'

/**
 * Sambungkan aktivitas API ke bilah progres bawaan Nuxt.
 * Navigasi halaman sudah ditangani NuxtLoadingIndicator sendiri; plugin ini
 * menambahkan permintaan data supaya klik tombol pun terlihat responsnya.
 */
export default defineNuxtPlugin(() => {
  const indicator = useLoadingIndicator()

  watch(apiPending, (busy) => {
    if (busy) indicator.start()
    else indicator.finish()
  })
})
