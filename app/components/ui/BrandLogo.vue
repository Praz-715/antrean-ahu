<script setup lang="ts">
/**
 * Berkas lambang diimpor, bukan ditunjuk lewat URL `/public`.
 *
 * Berkas di `public/` disajikan Nitro tanpa `Cache-Control` yang berarti —
 * server pengembangan menjawab `max-age=0`, yang MEWAJIBKAN peramban menanyakannya
 * ulang pada setiap pemuatan halaman, dan hasil build tidak mengirim header itu sama
 * sekali sehingga peramban menebak sendiri. Selama tanya-ulang itu berlangsung
 * `<img>`-nya masih kosong; itulah lambang yang muncul-hilang saat halaman memuat.
 *
 * Menyetel `nitro.publicAssets` tidak menolong: Nitro hanya memasang header cache
 * untuk entri yang punya `baseURL` sendiri (`/_nuxt/`, `/_fonts/`), sedangkan
 * seluruh isi `public/` berada di baseURL `/` dan tidak pernah masuk daftar itu.
 *
 * Lewat impor, berkasnya ditangani Vite. Ukurannya 2,8 KB — di bawah ambang 4 KB —
 * jadi isinya ditanamkan sebagai `data:` URI langsung ke dalam bundel: tidak ada
 * permintaan jaringan sama sekali, sehingga tidak ada yang bisa gagal atau tertunda.
 * Kalau suatu saat berkasnya membesar melewati ambang itu, Vite otomatis beralih
 * mengeluarkannya sebagai berkas ber-sidik-isi di `/_nuxt/` — yang disajikan dengan
 * `max-age=31536000, immutable`. Kedua jalurnya sama-sama benar tanpa perlu diatur.
 *
 * CSP mengizinkannya: `img-src 'self' data: blob:` (lihat `security-headers.ts`).
 */
import logoAhu from '~/assets/img/logo-ahu.png'

/**
 * Lambang Pengayoman & AHU beserta nama sistem.
 *
 * Satu komponen untuk seluruh aplikasi karena berkas logonya punya satu sifat yang
 * mudah terlewat kalau dipasang manual di tiap halaman: garisnya emas (#fed206) di
 * atas latar tembus pandang. Di atas permukaan putih rasionya hanya ±1,6:1 — tulisan
 * "PENGAYOMAN" di dalamnya praktis hilang. Karena itu logonya selalu dialasi bidang
 * navy (`plate`), persis seperti pemakaian resminya; `plate` hanya dimatikan saat
 * komponen ini sudah berada di atas permukaan navy dan alasnya jadi mubazir.
 *
 * Nama sistemnya pun ikut di sini, bukan ditulis ulang tiap tempat, supaya ejaan dan
 * pemenggalan barisnya sama di sidebar, halaman masuk, layar antrean, dan tiket.
 */
const props = withDefaults(defineProps<{
  /** Tinggi lambang. Ukuran teks nama sistem mengikutinya. */
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  /** Tulis nama sistem di samping lambang. */
  wordmark?: boolean
  /** Baris kedua di bawah nama sistem (mis. nama instansi). */
  caption?: string
  /**
   * Alas navy di belakang lambang. Matikan hanya bila latarnya sudah navy.
   */
  plate?: boolean
  /**
   * Latar di belakang komponen ini gelap/navy, jadi teksnya ditulis terang.
   * Tanpa ini warnanya mengikuti tema (gelap di tema terang, terang di tema gelap).
   */
  onDark?: boolean
}>(), {
  size: 'md',
  wordmark: false,
  caption: '',
  plate: true,
  onDark: false,
})

/** Lambangnya 171×86 px — rasio ±2:1, jadi hanya tingginya yang diatur. */
const tinggiLambang = {
  xs: 'h-4',
  sm: 'h-5',
  md: 'h-7',
  lg: 'h-10',
  xl: 'h-14',
}

/** Sisi alas dibuat sempit di ukuran kecil supaya tidak menelan tinggi bilah. */
const jarakAlas = {
  xs: 'px-1.5 py-1 rounded-md',
  sm: 'px-2 py-1.5 rounded-lg',
  md: 'px-2.5 py-2 rounded-lg',
  lg: 'px-3 py-2.5 rounded-xl',
  xl: 'px-4 py-3.5 rounded-2xl',
}

const ukuranNama = {
  xs: 'text-[10px]',
  sm: 'text-xs',
  md: 'text-sm',
  lg: 'text-base',
  xl: 'text-xl',
}

const ukuranKeterangan = {
  xs: 'text-[9px]',
  sm: 'text-[10px]',
  md: 'text-[11px]',
  lg: 'text-xs',
  xl: 'text-sm',
}

/**
 * "AHU" diberi warna tersendiri supaya bagian nama yang paling dikenali menonjol.
 * Emas hanya dipakai di atas latar gelap; di tema terang diganti navy — kuning di
 * atas putih tidak terbaca.
 */
const warnaAhu = computed(() =>
  props.onDark ? 'text-gold-400' : 'text-brand-600 dark:text-gold-400',
)
</script>

<template>
  <span class="inline-flex items-center gap-2.5">
    <span
      v-if="plate"
      class="inline-flex shrink-0 items-center bg-brand-900 ring-1 ring-brand-800/70 dark:ring-brand-700/60"
      :class="jarakAlas[size]"
    >
      <img
        :src="logoAhu"
        alt="Logo Kementerian Hukum dan Direktorat Jenderal Administrasi Hukum Umum"
        class="w-auto object-contain"
        :class="tinggiLambang[size]"
      >
    </span>

    <img
      v-else
      :src="logoAhu"
      alt="Logo Kementerian Hukum dan Direktorat Jenderal Administrasi Hukum Umum"
      class="w-auto shrink-0 object-contain"
      :class="tinggiLambang[size]"
    >

    <span v-if="wordmark" class="min-w-0 leading-tight">
      <span
        class="block font-extrabold uppercase tracking-tight"
        :class="[ukuranNama[size], onDark ? 'text-white' : '']"
      >
        Sistem Antrean <span :class="warnaAhu">AHU</span>
      </span>
      <span
        v-if="caption"
        class="block truncate font-medium uppercase tracking-[0.14em]"
        :class="[ukuranKeterangan[size], onDark ? 'text-white/60' : 'text-slate-500']"
      >
        {{ caption }}
      </span>
    </span>
  </span>
</template>
