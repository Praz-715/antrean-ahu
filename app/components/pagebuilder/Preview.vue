<script setup lang="ts">
import type { PreviewDevice, PublicPageView } from '#shared/types/public-page'

/**
 * Pratinjau halaman publik di dalam builder.
 *
 * Isinya BUKAN tiruan: yang digambar di sini `PublicPageRenderer` yang sama persis
 * dengan yang dipakai pengunjung. Bedanya cuma lebar wadah dan prop `preview`, yang
 * mematikan tombol supaya mengklik di builder tidak benar-benar membuat antrean.
 *
 * Halaman dirender pada lebar perangkat yang SEBENARNYA lalu diperkecil dengan
 * `transform: scale`. Kalau hanya disempitkan mengikuti kotak yang tersedia,
 * pratinjau "Desktop" menunjukkan dua kolom padahal desktop sungguhan menampilkan
 * tiga — admin lalu mengubah setelan untuk memperbaiki masalah yang tidak ada.
 */
defineProps<{ view: PublicPageView }>()

const device = defineModel<PreviewDevice>('device', { default: 'desktop' })

const PERANGKAT: Array<{ key: PreviewDevice, label: string, icon: string, width: number }> = [
  { key: 'desktop', label: 'Desktop', icon: 'i-lucide-monitor', width: 1280 },
  { key: 'tablet', label: 'Tablet', icon: 'i-lucide-tablet', width: 768 },
  { key: 'mobile', label: 'Ponsel', icon: 'i-lucide-smartphone', width: 390 },
]

const lebarPerangkat = computed(() => PERANGKAT.find(p => p.key === device.value)?.width ?? 1280)

/* Ukuran kotak yang tersedia; dipantau supaya skalanya ikut saat jendela diubah. */
const wadah = ref<HTMLElement | null>(null)
const lebarWadah = ref(0)
const tinggiWadah = ref(0)

onMounted(() => {
  if (!wadah.value) return
  const ro = new ResizeObserver(([entry]) => {
    if (!entry) return
    lebarWadah.value = entry.contentRect.width
    tinggiWadah.value = entry.contentRect.height
  })
  ro.observe(wadah.value)
  onBeforeUnmount(() => ro.disconnect())
})

/** Tidak pernah diperbesar: pratinjau ponsel tetap seukuran ponsel. */
const skala = computed(() =>
  lebarWadah.value ? Math.min(1, lebarWadah.value / lebarPerangkat.value) : 1)

const gayaBingkai = computed(() => ({
  width: `${Math.round(lebarPerangkat.value * skala.value)}px`,
  height: tinggiWadah.value ? `${Math.round(tinggiWadah.value)}px` : undefined,
}))

const gayaHalaman = computed(() => ({
  width: `${lebarPerangkat.value}px`,
  height: tinggiWadah.value ? `${Math.round(tinggiWadah.value / skala.value)}px` : '800px',
  transform: `scale(${skala.value})`,
  transformOrigin: 'top left',
}))

const persen = computed(() => Math.round(skala.value * 100))
</script>

<template>
  <div class="flex min-h-0 flex-col">
    <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
      <h2 class="text-xs font-semibold uppercase tracking-wide text-slate-500">
        Pratinjau
        <span v-if="persen < 100" class="ml-1 font-normal normal-case tracking-normal text-slate-400">
          (diperkecil {{ persen }}%)
        </span>
      </h2>

      <div
        class="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 dark:border-slate-700 dark:bg-slate-900"
        role="group"
        aria-label="Lebar pratinjau"
      >
        <button
          v-for="p in PERANGKAT"
          :key="p.key"
          type="button"
          class="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors"
          :class="device === p.key
            ? 'bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300'
            : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800'"
          :aria-pressed="device === p.key"
          :title="`Pratinjau ${p.label} (${p.width}px)`"
          @click="device = p.key"
        >
          <UIcon :name="p.icon" class="size-4" />
          <span class="hidden sm:inline">{{ p.label }}</span>
        </button>
      </div>
    </div>

    <div
      ref="wadah"
      class="min-h-0 flex-1 overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 p-3 dark:border-slate-800 dark:bg-slate-900/40 sm:p-4"
    >
      <div
        class="mx-auto overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition-[width] duration-300 dark:border-slate-700 dark:bg-slate-950"
        :style="gayaBingkai"
      >
        <!-- Digulir di dalam kotaknya sendiri supaya panel setelan tetap di tempat -->
        <div class="overflow-y-auto" :style="gayaHalaman">
          <PublicPageRenderer :view="view" preview />
        </div>
      </div>
    </div>
  </div>
</template>
