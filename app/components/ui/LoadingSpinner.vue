<script setup lang="ts">
/**
 * Penanda memuat mengambang di pojok.
 *
 * Diletakkan di kiri-bawah, bukan kanan-bawah tempat toast Nuxt UI muncul dan
 * bukan kanan-atas tempat sakelar tema mengambang — dua sudut yang sudah terpakai.
 * Lebih terlihat daripada bilah 3px tanpa menutupi apa pun, jadi cocok untuk
 * panel operator yang dipakai sambil melihat ke arah loket.
 */
defineProps<{ active: boolean }>()
</script>

<template>
  <Transition
    enter-active-class="transition duration-200"
    enter-from-class="opacity-0 translate-y-2"
    leave-active-class="transition duration-200"
    leave-to-class="opacity-0 translate-y-2"
  >
    <div
      v-if="active"
      class="pointer-events-none fixed bottom-4 left-4 z-[60] flex items-center gap-2 rounded-full bg-gold-400 py-2 pl-2 pr-4 text-xs font-bold text-brand-900 shadow-lg ring-1 ring-brand-900/20"
      role="status"
      aria-live="polite"
    >
      <span class="antrean-loading-ring size-4 shrink-0 rounded-full" aria-hidden="true" />
      Memuat…
    </div>
  </Transition>
</template>
