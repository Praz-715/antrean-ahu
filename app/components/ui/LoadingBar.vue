<script setup lang="ts">
/**
 * Bilah tipis di puncak halaman.
 *
 * Tidak memakai `NuxtLoadingIndicator` karena komponen itu terikat pada
 * `useLoadingIndicator()`, yang mendaftarkan hook navigasi rute sendiri — dan itu
 * membuat bilahnya mustahil dipisahkan dari navigasi saat pengaturan meminta
 * bilah hanya untuk aktivitas API (lihat `plugins/route-loading.client.ts`).
 *
 * Gerakannya sengaja tak menentu, bukan progres 0–100%: tak ada yang benar-benar
 * tahu berapa lama satu navigasi atau satu permintaan akan berjalan, dan angka
 * progres yang ditebak-tebak sempat berhenti di 80% lalu melompat ke selesai.
 * Bilah yang jelas-jelas "sedang berjalan" lebih jujur.
 */
defineProps<{ active: boolean }>()
</script>

<template>
  <!--
    `aria-hidden` saat mati, dan `role="progressbar"` saat hidup: pembaca layar
    sudah diberi tahu keadaan memuat oleh halaman yang memuatnya (`USkeleton`
    membawa `aria-busy`), jadi bilah ini tidak perlu ikut bersuara saat diam.
  -->
  <div
    class="pointer-events-none fixed inset-x-0 top-0 z-[60] h-[3px] overflow-hidden transition-opacity duration-200"
    :class="active ? 'opacity-100' : 'opacity-0'"
    :aria-hidden="!active"
    role="progressbar"
    aria-label="Memuat"
  >
    <div v-if="active" class="antrean-loading-bar h-full w-full" />
  </div>
</template>
