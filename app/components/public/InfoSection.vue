<script setup lang="ts">
import type { PublicPageView } from '#shared/types/public-page'

/**
 * Informasi layanan dari admin — syarat berkas, jam istirahat, pengumuman.
 *
 * Sumbernya tetap kolom `infoHtml` yang sudah ada; tidak ada tabel atau kolom baru
 * untuk ini. Yang berubah cara menampilkannya: tiap baris menjadi satu butir, karena
 * satu blok teks panjang di dalam kotak kuning praktis tidak dibaca siapa pun di
 * ponsel. Isinya tetap dirender sebagai TEKS BIASA — interpolasi Vue meng-escape
 * sendiri, dan sistem ini tidak punya sanitizer HTML.
 */
const props = defineProps<{ view: PublicPageView }>()

const cfg = computed(() => props.view.page.theme.info)

/** Baris kosong dibuang supaya jarak antar-paragraf tidak menjadi kartu hampa. */
const butir = computed(() =>
  (props.view.page.infoHtml ?? '')
    .split(/\r?\n/)
    .map(baris => baris.trim())
    .filter(Boolean),
)
</script>

<template>
  <section v-if="butir.length" aria-labelledby="judul-informasi">
    <h2 id="judul-informasi" class="mb-4 text-lg font-bold text-slate-900 @2xl:text-xl dark:text-slate-50">
      {{ cfg.title }}
    </h2>

    <div v-if="cfg.style === 'cards'" class="grid gap-3 @xl:grid-cols-2">
      <div
        v-for="(baris, i) in butir"
        :key="i"
        class="flex items-start gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
      >
        <span
          class="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-lg"
          style="background-color: color-mix(in srgb, var(--public-primary) 12%, transparent); color: var(--public-link)"
          aria-hidden="true"
        >
          <UIcon name="i-lucide-check" class="size-3.5" />
        </span>
        <p class="text-pretty">
          {{ baris }}
        </p>
      </div>
    </div>

    <div
      v-else
      class="rounded-2xl border border-slate-200/80 bg-white p-5 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
    >
      <p class="whitespace-pre-line text-pretty">
        {{ view.page.infoHtml }}
      </p>
    </div>
  </section>
</template>
