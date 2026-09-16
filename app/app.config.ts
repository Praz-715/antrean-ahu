/**
 * `USkeleton` bawaan Nuxt UI menuliskan `animate-pulse` langsung di kelas dasarnya,
 * jadi animasinya tidak bisa diganti dari luar tanpa menyunting ±40 pemakaiannya
 * satu per satu. Di sini ditambahkan satu kelas penanda; animasinya sendiri diatur
 * dari `assets/css/main.css` berdasarkan atribut `data-skeleton` di elemen `html`
 * — satu tempat, berlaku untuk seluruh halaman.
 *
 * Perhatikan: ini MENAMBAH, bukan mengganti. Nuxt UI merakit kelasnya dengan
 * `tv({ extend: theme, ...appConfig.ui.skeleton })`, dan `extend` menggabungkan
 * daftar kelas — `animate-pulse` bawaannya tetap ikut terpasang. Karena itu
 * `main.css` menetralkannya lebih dulu (`animation: none`) sebelum memasang
 * animasi yang dipilih; tanpa itu gaya "shimmer" berjalan bersamaan dengan pulse
 * dan gaya "diam" tidak pernah benar-benar diam.
 */
export default defineAppConfig({
  ui: {
    skeleton: {
      base: 'antrean-skeleton',
    },
  },
})
