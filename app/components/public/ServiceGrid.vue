<script setup lang="ts">
import type { PublicPageView, PublicTicketView } from '#shared/types/public-page'

/**
 * Daftar layanan sebagai kisi kartu.
 *
 * Jumlah kolomnya diatur admin, tetapi hanya untuk wadah yang lebar — di lebar
 * ponsel selalu satu kolom apa pun setelannya. Pilihan "4 kolom" yang dipaksakan ke
 * layar 390px menghasilkan kartu selebar 80px yang tidak terbaca siapa pun.
 */
const props = defineProps<{
  view: PublicPageView
  tickets?: Record<string, PublicTicketView>
  preview?: boolean
}>()

const emit = defineEmits<{ select: [id: string] }>()

const cfg = computed(() => props.view.page.theme.services)

/**
 * Kelas kisi ditulis utuh, bukan dirangkai dari potongan string.
 *
 * Tailwind memindai kode sumber apa adanya; `grid-cols-${n}` tidak pernah ikut
 * terbentuk di CSS akhir. Varian `@` mengacu pada lebar WADAH, sehingga pratinjau
 * ponsel di builder benar-benar menunjukkan satu kolom.
 */
const kisi = computed(() => ({
  2: 'grid-cols-1 @xl:grid-cols-2',
  3: 'grid-cols-1 @xl:grid-cols-2 @4xl:grid-cols-3',
  4: 'grid-cols-1 @xl:grid-cols-2 @4xl:grid-cols-3 @6xl:grid-cols-4',
}[cfg.value.columns] ?? 'grid-cols-1 @xl:grid-cols-2 @4xl:grid-cols-3'))
</script>

<template>
  <section aria-labelledby="judul-layanan">
    <div class="mb-4 flex flex-wrap items-end justify-between gap-2">
      <div class="min-w-0">
        <h2 id="judul-layanan" class="text-lg font-bold text-slate-900 @2xl:text-xl dark:text-slate-50">
          {{ cfg.title }}
        </h2>
        <p v-if="cfg.subtitle" class="mt-0.5 text-sm text-slate-500">
          {{ cfg.subtitle }}
        </p>
      </div>
      <p v-if="view.queueTypes.length" class="shrink-0 text-sm text-slate-500">
        {{ view.queueTypes.length }} layanan
      </p>
    </div>

    <div
      v-if="!view.queueTypes.length"
      class="rounded-2xl border border-dashed border-slate-300 py-14 text-center text-slate-500 dark:border-slate-700"
    >
      <UIcon name="i-lucide-inbox" class="mx-auto size-8 text-slate-400" />
      <p class="mt-2 text-sm">
        Belum ada layanan yang tersedia.
      </p>
    </div>

    <div v-else class="grid gap-4" :class="kisi">
      <PublicServiceCard
        v-for="service in view.queueTypes"
        :key="service.id"
        :service="service"
        :theme="view.page.theme"
        :ticket="tickets?.[service.id] ?? null"
        :disabled="!view.openState.acceptsNewQueue && !tickets?.[service.id]"
        :preview="preview"
        @select="emit('select', service.id)"
      />
    </div>
  </section>
</template>
