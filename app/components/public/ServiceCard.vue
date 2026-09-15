<script setup lang="ts">
import type { PublicServiceView, PublicTicketView } from '#shared/types/public-page'
import type { PublicPageTheme } from '#shared/schemas/public-page'
import { withAlpha } from '#shared/utils/color'

/**
 * Satu layanan sebagai kartu.
 *
 * Menggantikan baris daftar yang lama, yang menempatkan jumlah antrean sebagai teks
 * abu-abu kecil di bawah nama — informasi yang justru paling menentukan pilihan
 * pengunjung ("mana yang paling sepi?"). Di sini jumlah menunggu dan estimasi berdiri
 * sebagai dua angka sejajar yang terbaca sekilas.
 */
const props = defineProps<{
  service: PublicServiceView
  theme: PublicPageTheme
  /** Nomor yang sudah dipegang pengunjung pada layanan ini, bila ada. */
  ticket?: PublicTicketView | null
  /** Pendaftaran ditutup: kartunya tetap tampil, tombolnya yang mati. */
  disabled?: boolean
  preview?: boolean
}>()

const emit = defineEmits<{ select: [] }>()

// Warna layanan dipilih admin; disesuaikan agar tetap terbaca pada tema aktif.
const { readable } = useReadableColor()

const cfg = computed(() => props.theme.services)

const gaya = computed(() => ({
  elevated: 'border-slate-200/80 bg-white shadow-sm hover:shadow-md dark:border-slate-800 dark:bg-slate-900',
  outlined: 'border-slate-300 bg-transparent hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-900/60',
  soft: 'border-transparent bg-slate-100 hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800/70',
}[cfg.value.cardStyle]))

const estimasi = computed(() => {
  if (!props.service.waitingCount) return 'Tanpa antrean'
  const menit = Math.round((props.service.estServiceSeconds * props.service.waitingCount) / 60)
  return `± ${menit} menit`
})

const warnaLembut = computed(() => withAlpha(props.service.color, 0.12))
</script>

<template>
  <article
    class="group flex flex-col rounded-2xl border p-5 transition-all"
    :class="[gaya, disabled ? 'opacity-60' : '']"
  >
    <div class="flex items-start gap-3">
      <div
        class="flex size-12 shrink-0 items-center justify-center rounded-xl text-lg font-extrabold"
        :style="{ backgroundColor: warnaLembut, color: readable(service.color) }"
        aria-hidden="true"
      >
        <UIcon v-if="cfg.showIcon && service.icon" :name="service.icon" class="size-6" />
        <template v-else>
          {{ service.code }}
        </template>
      </div>

      <div class="min-w-0 flex-1">
        <!-- Kode layanan tetap terlihat walau ikonnya dipakai di kotak sebelah:
             pengunjung mencocokkannya dengan nomor antrean dan layar pemanggilan. -->
        <p class="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
          Layanan {{ service.code }}
        </p>
        <h3 class="mt-0.5 text-pretty font-semibold leading-snug text-slate-900 dark:text-slate-50">
          {{ service.name }}
        </h3>
        <p v-if="service.description" class="mt-1 line-clamp-2 text-sm text-slate-500 dark:text-slate-400">
          {{ service.description }}
        </p>
      </div>
    </div>

    <dl
      v-if="cfg.showWaiting || cfg.showEstimate"
      class="mt-4 grid gap-3 rounded-xl bg-slate-50/80 p-3 dark:bg-slate-800/40"
      :class="cfg.showWaiting && cfg.showEstimate ? 'grid-cols-2' : 'grid-cols-1'"
    >
      <div v-if="cfg.showWaiting" class="min-w-0">
        <dt class="flex items-center gap-1.5 text-xs text-slate-500">
          <UIcon name="i-lucide-users" class="size-3.5 shrink-0" />
          Menunggu
        </dt>
        <dd class="mt-0.5 text-lg font-bold tabular-nums text-slate-900 dark:text-slate-50">
          {{ service.waitingCount }}
          <span class="text-xs font-medium text-slate-500">orang</span>
        </dd>
      </div>
      <div v-if="cfg.showEstimate" class="min-w-0">
        <dt class="flex items-center gap-1.5 text-xs text-slate-500">
          <UIcon name="i-lucide-timer" class="size-3.5 shrink-0" />
          Estimasi
        </dt>
        <!-- Tidak dipotong: "Tanpa antrean" adalah jawaban terpenting di kartu ini,
             dan "Tanpa antr…" justru menimbulkan pertanyaan baru. -->
        <dd class="mt-0.5 text-base font-bold leading-tight text-slate-900 dark:text-slate-50">
          {{ estimasi }}
        </dd>
      </div>
    </dl>

    <!-- Sudah punya nomor: itulah yang paling ingin dilihat pengunjung yang kembali -->
    <p
      v-if="ticket"
      class="mt-4 inline-flex items-center gap-1.5 self-start rounded-full px-3 py-1 text-sm font-semibold"
      :style="{ backgroundColor: warnaLembut, color: readable(service.color) }"
    >
      <UIcon name="i-lucide-ticket" class="size-4" />
      Nomor Anda {{ ticket.queueNumber }}
    </p>

    <div class="mt-auto pt-4">
      <button
        v-if="cfg.ctaStyle === 'button'"
        type="button"
        class="inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-transform hover:scale-[1.01] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
        :style="{ backgroundColor: 'var(--public-primary)', color: 'var(--public-on-primary)', outlineColor: 'var(--public-primary)' }"
        :disabled="disabled || preview"
        @click="emit('select')"
      >
        <UIcon :name="ticket ? 'i-lucide-eye' : 'i-lucide-ticket'" class="size-4" />
        {{ ticket ? 'Lihat Nomor Saya' : 'Ambil Nomor' }}
      </button>

      <button
        v-else
        type="button"
        class="inline-flex items-center gap-1 text-sm font-semibold transition-colors hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        :style="{ color: 'var(--public-link)', outlineColor: 'var(--public-primary)' }"
        :disabled="disabled || preview"
        @click="emit('select')"
      >
        {{ ticket ? 'Lihat nomor saya' : 'Ambil nomor' }}
        <UIcon name="i-lucide-arrow-right" class="size-4 transition-transform group-hover:translate-x-0.5" />
      </button>
    </div>
  </article>
</template>
