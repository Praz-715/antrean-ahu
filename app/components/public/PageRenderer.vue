<script setup lang="ts">
import type { PublicPageView, PublicTicketView } from '#shared/types/public-page'
import { accentOf } from '#shared/schemas/public-page'
import { onColor } from '#shared/utils/color'

/**
 * Perender halaman publik — dipakai halaman pengunjung DAN pratinjau builder.
 *
 * Itu intinya: kalau pratinjau digambar terpisah, cepat atau lambat keduanya
 * berbeda, dan admin memublikasikan sesuatu yang tidak pernah ia lihat. Di sini
 * satu-satunya perbedaan adalah prop `preview`, yang mematikan tombol supaya
 * mengklik di dalam builder tidak benar-benar membuat antrean.
 *
 * Warna disalurkan lewat properti khusus CSS (`--public-*`) alih-alih ditempel pada
 * tiap elemen: komponen anak cukup menyebut variabelnya, dan mengganti warna di
 * builder langsung terasa di seluruh pohon tanpa satu pun watcher.
 */
const props = defineProps<{
  view: PublicPageView
  tickets?: Record<string, PublicTicketView>
  /** Mematikan seluruh aksi; dipakai pratinjau di builder. */
  preview?: boolean
}>()

const emit = defineEmits<{ select: [id: string] }>()

// Warna utama sering pekat; sebagai teks di tema gelap ia perlu diterangkan dulu.
const { readable } = useReadableColor()

const cssVars = computed(() => {
  const t = props.view.page.theme
  return {
    '--public-primary': t.primaryColor,
    '--public-secondary': t.secondaryColor,
    '--public-accent': accentOf(t),
    /** Warna teks yang kontras di atas warna utama (hero, tombol). */
    '--public-on-primary': onColor(t.primaryColor),
    /** Warna utama versi aman-dibaca, untuk teks dan ikon di atas latar halaman. */
    '--public-link': readable(t.primaryColor) ?? t.primaryColor,
    ...(t.fontFamily ? { 'fontFamily': t.fontFamily } : {}),
  } as Record<string, string>
})

const hero = computed(() => props.view.page.theme.hero)

const bagianLayanan = ref<HTMLElement | null>(null)

/**
 * Tombol di hero mengantar ke daftar layanan, bukan langsung membuka formulir.
 *
 * Memilih layanan adalah keputusan pengunjung, dan menebaknya — dulu selalu layanan
 * pertama — membuat sebagian orang mengambil nomor di loket yang salah tanpa pernah
 * melihat pilihan lainnya. Fokus ikut dipindahkan supaya pengguna papan ketik tidak
 * tertinggal di hero setelah halaman bergulir.
 */
function keLayanan() {
  if (props.preview) return
  const el = bagianLayanan.value
  if (!el) return

  const halus = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
  el.scrollIntoView({ behavior: halus ? 'smooth' : 'auto', block: 'start' })
  el.focus({ preventScroll: true })
}
</script>

<template>
  <!--
    `@container` membuat seluruh isi halaman menanggapi lebar WADAH, bukan lebar
    jendela. Halaman sungguhan memakai lebar penuh; pratinjau builder menyempitkannya
    ke ukuran perangkat — dan tata letaknya ikut berubah seperti di perangkat asli.
  -->
  <div
    class="@container min-h-full bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100"
    :style="cssVars"
  >
    <PublicHero v-if="hero.enabled" :view="view" :preview="preview" @cta="keLayanan" />

    <!-- Tanpa hero, halaman tetap butuh identitas — versi ringkasnya. -->
    <header
      v-else
      class="px-5 py-8 @2xl:px-8"
      :style="{ backgroundColor: 'var(--public-primary)', color: 'var(--public-on-primary)' }"
    >
      <div class="mx-auto flex w-full max-w-5xl items-center gap-3">
        <img
          v-if="view.page.logoUrl || view.organization?.logoUrl"
          :src="view.page.logoUrl ?? view.organization?.logoUrl ?? ''"
          alt=""
          class="h-10 w-auto object-contain"
        >
        <div class="min-w-0">
          <h1 class="truncate text-xl font-extrabold">
            {{ view.page.title }}
          </h1>
          <p v-if="view.page.subtitle" class="truncate text-sm opacity-80">
            {{ view.page.subtitle }}
          </p>
        </div>
      </div>
    </header>

    <main class="mx-auto w-full max-w-5xl px-5 @2xl:px-8">
      <!-- Ditarik naik agar menumpuk pada batas hero: status buka tidak boleh
           terlewat hanya karena pengunjung langsung menggulir ke layanan. -->
      <div class="-mt-7 @2xl:-mt-9">
        <PublicStatusBar :open-state="view.openState" />
      </div>

      <div
        v-if="!view.features.publicRegistration"
        class="mt-6 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200"
      >
        <UIcon name="i-lucide-hand" class="mt-0.5 size-5 shrink-0" />
        <div>
          <p class="font-semibold">
            Pengambilan nomor mandiri sedang ditutup
          </p>
          <p class="mt-0.5 opacity-90">
            Silakan hubungi petugas di lokasi untuk mendapatkan nomor antrean.
          </p>
        </div>
      </div>

      <!--
        Sasaran tombol hero. `tabindex="-1"` hanya supaya bisa difokuskan lewat
        kode — bukan perhentian tambahan saat pengguna menekan Tab.
      -->
      <div ref="bagianLayanan" tabindex="-1" class="mt-8 scroll-mt-4 outline-none">
        <PublicServiceGrid
          :view="view"
          :tickets="tickets"
          :preview="preview"
          @select="(id) => emit('select', id)"
        />
      </div>

      <div class="mt-10">
        <PublicInfoSection :view="view" />
      </div>
    </main>

    <PublicFooter :view="view" />
  </div>
</template>
