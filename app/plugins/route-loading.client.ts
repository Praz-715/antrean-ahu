import { routeLoadingStart, routeLoadingEnd } from '../composables/useLoadingState'

/**
 * Sambungkan navigasi rute ke penanda memuat milik aplikasi ini.
 *
 * Nuxt sudah punya `useLoadingIndicator()`, tetapi composable itu MENDAFTARKAN
 * SENDIRI hook `page:loading:start`/`end` begitu dipanggil — siapa pun yang
 * memakainya ikut menyalakan bilah progresnya pada setiap navigasi. Selama bilah
 * itu satu-satunya indikator, perilaku tersebut memang yang diinginkan; sejak
 * navigasi rute dan aktivitas API bisa dipilih terpisah lewat pengaturan, keduanya
 * harus bisa dinyalakan sendiri-sendiri. Karena itu hooknya dipegang di sini.
 */
export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.hook('page:loading:start', routeLoadingStart)
  nuxtApp.hook('page:loading:end', routeLoadingEnd)

  /**
   * Galat render juga harus mematikan penandanya. Tanpa ini, navigasi yang
   * berujung pada halaman galat meninggalkan overlay atau spinner menyala
   * selamanya di atas halaman galat itu.
   */
  nuxtApp.hook('vue:error', routeLoadingEnd)
})
