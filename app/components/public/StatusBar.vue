<script setup lang="ts">
import type { PublicOpenState } from '#shared/types/public-page'

/**
 * Status buka/tutup layanan hari ini.
 *
 * Ditaruh menumpuk di batas bawah hero: pengunjung yang datang di luar jam layanan
 * harus tahu itu sebelum menggulir dan memilih layanan, bukan sesudah formulirnya
 * ditolak.
 */
defineProps<{ openState: PublicOpenState }>()
</script>

<template>
  <div
    class="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-slate-200/80 bg-white/95 p-4 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-900/95"
  >
    <span
      class="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide"
      :class="openState.isOpen
        ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
        : 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300'"
    >
      <span
        class="size-2 rounded-full"
        :class="openState.isOpen ? 'animate-pulse bg-emerald-500' : 'bg-rose-500'"
        aria-hidden="true"
      />
      {{ openState.isOpen ? 'Buka' : 'Tutup' }}
    </span>

    <p class="min-w-0 flex-1 text-sm text-slate-600 dark:text-slate-300">
      {{ openState.message }}
    </p>

    <p v-if="openState.openTime" class="flex shrink-0 items-center gap-1.5 text-sm font-medium text-slate-700 dark:text-slate-200">
      <UIcon name="i-lucide-clock" class="size-4 text-slate-400" />
      {{ openState.openTime }}–{{ openState.closeTime }}
    </p>
  </div>
</template>
