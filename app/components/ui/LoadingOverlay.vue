<script setup lang="ts">
/**
 * Overlay navy layar penuh berlambang AHU.
 *
 * Untuk pemasangan yang ditonton dari jauh — kios layar sentuh di lobi, tablet
 * pengambilan nomor — tempat bilah 3px di puncak layar 43 inci praktis tak
 * terlihat. Karena menutupi seluruh halaman, ia HANYA dipakai untuk navigasi rute,
 * bukan aktivitas API: menutupi layar tiap kali satu tombol ditekan akan membuat
 * antarmuka terasa lebih lambat daripada sebenarnya.
 *
 * `pointer-events-auto` memang disengaja — selama pindah halaman, klik yang
 * nyasar ke halaman yang sedang ditinggalkan tidak berguna.
 */
defineProps<{ active: boolean }>()
</script>

<template>
  <Transition
    enter-active-class="transition-opacity duration-150"
    enter-from-class="opacity-0"
    leave-active-class="transition-opacity duration-200"
    leave-to-class="opacity-0"
  >
    <div
      v-if="active"
      class="fixed inset-0 z-[70] flex flex-col items-center justify-center gap-6 bg-brand-900/95 backdrop-blur-sm"
      role="status"
      aria-live="polite"
    >
      <!--
        Berpakai alas meski latarnya navy: overlay ini 95% tembus pandang di atas
        halaman yang ditinggalkan, jadi warna di belakang lambang bukan navy murni
        dan blok semi-transparan di berkas logonya muncul sebagai kotak gelap.
      -->
      <UiBrandLogo size="xl" />
      <span class="antrean-loading-ring size-7 rounded-full text-gold-400" aria-hidden="true" />
      <p class="text-sm font-semibold uppercase tracking-[0.3em] text-brand-200">
        Memuat
      </p>
    </div>
  </Transition>
</template>
