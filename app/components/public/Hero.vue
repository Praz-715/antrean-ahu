<script setup lang="ts">
import type { PublicPageView } from '#shared/types/public-page'
import { accentOf } from '#shared/schemas/public-page'
import { formatDateRange } from '#shared/utils/service-date'

/**
 * Bagian pembuka halaman publik: identitas event, waktu layanan, dan satu ajakan
 * bertindak.
 *
 * Tugasnya menjawab tiga pertanyaan pengunjung dalam beberapa detik — acara apa ini,
 * kapan dibuka, dan bagaimana mengambil nomor — sebelum ia menggulir ke daftar
 * layanan. Karena itu tombolnya hanya satu, dan seluruh metadata ditulis sebagai
 * lencana pendek, bukan paragraf.
 */
const props = defineProps<{
  view: PublicPageView
  /** Di pratinjau builder, tombol tidak melakukan apa-apa. */
  preview?: boolean
}>()

const emit = defineEmits<{ cta: [] }>()

const hero = computed(() => props.view.page.theme.hero)

const judul = computed(() => hero.value.title || props.view.page.title)
const subjudul = computed(() => hero.value.subtitle || props.view.page.subtitle || '')
const deskripsi = computed(() => hero.value.description || props.view.page.description || '')

const tanggal = computed(() => formatDateRange(props.view.event.startDate, props.view.event.endDate))
const jam = computed(() => {
  const { openTime, closeTime } = props.view.openState
  return openTime && closeTime ? `${openTime} – ${closeTime}` : ''
})

const lencana = computed(() => [
  ...(hero.value.showDate && tanggal.value ? [{ icon: 'i-lucide-calendar-days', text: tanggal.value }] : []),
  ...(hero.value.showTime && jam.value ? [{ icon: 'i-lucide-clock', text: jam.value }] : []),
  ...(hero.value.showLocation && hero.value.location ? [{ icon: 'i-lucide-map-pin', text: hero.value.location }] : []),
])

/**
 * Tinggi hero mengikuti lebar wadahnya, bukan lebar jendela.
 *
 * Perender ini dipakai halaman sungguhan DAN pratinjau builder yang lebarnya
 * dikecilkan; dengan kueri wadah, pratinjau ponsel benar-benar memakai tata letak
 * ponsel alih-alih tata letak desktop yang diciutkan.
 */
const tinggi = computed(() => ({
  compact: 'py-10 @2xl:py-12',
  medium: 'py-14 @2xl:py-20',
  large: 'py-20 @2xl:py-32',
}[hero.value.height]))

const perataan = computed(() => ({
  left: 'items-start text-left',
  center: 'items-center text-center',
  right: 'items-end text-right',
}[hero.value.align]))

const logo = computed(() => props.view.page.logoUrl || props.view.organization?.logoUrl || null)
const aksen = computed(() => accentOf(props.view.page.theme))
</script>

<template>
  <header
    class="relative isolate overflow-hidden bg-cover bg-center"
    :style="{
      backgroundColor: 'var(--public-primary)',
      ...(view.page.backgroundUrl ? { backgroundImage: `url(${view.page.backgroundUrl})` } : {}),
    }"
  >
    <!--
      Lapisan warna di atas gambar. Gradien miring dipakai supaya bagian bawah —
      tempat tombol berada — selalu lebih pekat daripada bagian atas: teks putih
      tetap terbaca walau adminnya memilih foto yang terang di sisi itu.
    -->
    <div
      v-if="view.page.backgroundUrl"
      class="pointer-events-none absolute inset-0 -z-10"
      :style="{
        background: `linear-gradient(160deg,
          color-mix(in srgb, var(--public-primary) ${hero.overlay}%, transparent) 0%,
          color-mix(in srgb, var(--public-secondary) ${Math.min(100, hero.overlay + 14)}%, transparent) 100%)`,
      }"
    />
    <div
      v-else
      class="pointer-events-none absolute inset-0 -z-10 opacity-90"
      :style="{
        background: `linear-gradient(160deg, var(--public-primary) 0%, ${aksen} 55%, var(--public-secondary) 100%)`,
      }"
    />

    <!--
      Peneduh tipis di kaki hero.
      Foto latar yang dipilih admin sering justru paling terang di bagian bawah —
      persis tempat tombol dan lencana berada. Lapisan ini bekerja di atas gambar
      apa pun tanpa membuat bagian atasnya ikut gelap.
    -->
    <div
      v-if="view.page.backgroundUrl"
      class="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-2/3"
      style="background: linear-gradient(to top, rgb(2 6 23 / 0.55), transparent)"
    />

    <div
      class="mx-auto flex w-full max-w-3xl flex-col px-5 @2xl:px-8"
      :class="[tinggi, perataan]"
      :style="{ color: 'var(--public-on-primary)' }"
    >
      <img
        v-if="logo"
        :src="logo"
        alt=""
        class="mb-5 h-12 w-auto object-contain @2xl:h-16"
      >

      <p class="text-[11px] font-semibold uppercase tracking-[0.22em] opacity-75">
        {{ view.organization?.name || 'Antrean' }}
      </p>

      <h1 class="mt-2 text-balance text-3xl font-extrabold leading-[1.1] @2xl:text-5xl">
        {{ judul }}
      </h1>

      <p v-if="subjudul" class="mt-3 max-w-xl text-pretty text-base opacity-90 @2xl:text-lg">
        {{ subjudul }}
      </p>
      <p v-if="deskripsi" class="mt-2 max-w-xl text-pretty text-sm opacity-75 @2xl:text-base">
        {{ deskripsi }}
      </p>

      <ul v-if="lencana.length" class="mt-6 flex flex-wrap gap-2" :class="hero.align === 'center' ? 'justify-center' : ''">
        <li
          v-for="item in lencana"
          :key="item.text"
          class="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium backdrop-blur-sm @2xl:text-sm"
          style="border-color: color-mix(in srgb, currentColor 25%, transparent); background-color: color-mix(in srgb, currentColor 12%, transparent)"
        >
          <UIcon :name="item.icon" class="size-4 shrink-0" />
          {{ item.text }}
        </li>
      </ul>

      <!--
        Tombol digambar sendiri, bukan UButton: warnanya harus mengikuti warna aksen
        pilihan admin lengkap dengan warna teks yang kontras — dua hal yang tidak bisa
        diwakili varian warna bawaan Nuxt UI.

        Tugasnya mengantar ke daftar layanan, bukan mengirim apa pun. Karena itu tetap
        hidup walau layanan sedang tutup — pengunjung masih boleh melihat layanan apa
        saja yang ada — dan ikonnya panah ke bawah, bukan tiket, supaya tidak
        menjanjikan sesuatu yang tidak terjadi saat ditekan.
      -->
      <button
        v-if="hero.ctaEnabled && view.features.publicRegistration"
        type="button"
        class="mt-7 inline-flex w-full items-center justify-center gap-2 rounded-xl px-6 py-3.5 text-base font-semibold shadow-lg transition-transform hover:scale-[1.02] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60 @xl:w-auto"
        :disabled="preview"
        :style="{ backgroundColor: 'var(--public-on-primary)', color: 'var(--public-primary)' }"
        @click="emit('cta')"
      >
        {{ hero.ctaText }}
        <UIcon name="i-lucide-arrow-down" class="size-5" />
      </button>
    </div>
  </header>
</template>
