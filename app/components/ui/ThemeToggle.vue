<script setup lang="ts">
/**
 * Sakelar tema terang ⇄ gelap.
 *
 * Dipakai di SELURUH halaman (lewat layout, atau langsung pada halaman yang tidak
 * memakai layout) supaya penggunanya tidak perlu mencari menu akun hanya untuk
 * mengganti tema — dan supaya halaman publik, yang pengunjungnya tidak punya menu
 * akun sama sekali, tetap bisa diganti temanya.
 *
 * Dibungkus `<ClientOnly>`: pilihan tema tersimpan di peramban (localStorage),
 * sedangkan render server selalu memakai nilai bawaan. Menggambar ikonnya saat SSR
 * membuat hasil hidrasi berbeda, dan Vue membuang DOM yang sudah dirender.
 */
const props = withDefaults(defineProps<{
  /**
   * Tombol mengambang di sudut kanan atas — untuk halaman yang tidak punya bilah
   * alat (beranda, login, halaman publik). Latarnya solid supaya tetap terbaca
   * di atas header berwarna merek maupun di atas latar polos.
   */
  floating?: boolean
  size?: 'xs' | 'sm' | 'md' | 'lg'
}>(), { floating: false, size: 'md' })

const colorMode = useColorMode()
const isDark = computed(() => colorMode.value === 'dark')

const label = computed(() => isDark.value ? 'Ganti ke mode terang' : 'Ganti ke mode gelap')

/**
 * Menulis ke `preference`, bukan ke `value`.
 *
 * `value` hanya hasil hitungan; `preference` yang disimpan dan dibaca lagi saat
 * halaman berikutnya dibuka. Pilihan pengguna juga sengaja mengunci tema (bukan
 * lagi mengikuti sistem) — itulah yang ia minta dengan menekan tombol ini.
 */
function toggle() {
  colorMode.preference = isDark.value ? 'light' : 'dark'
}

const floatingClass = 'fixed right-4 top-4 z-50 shadow-lg ring-1 ring-slate-900/10 dark:ring-white/10'
</script>

<template>
  <ClientOnly>
    <UButton
      :icon="isDark ? 'i-lucide-sun' : 'i-lucide-moon'"
      :size="props.size"
      :variant="props.floating ? 'solid' : 'ghost'"
      color="neutral"
      :class="props.floating ? floatingClass : undefined"
      :aria-label="label"
      :title="label"
      data-theme-toggle
      @click="toggle"
    />

    <!--
      Pengganti selama SSR & sebelum hidrasi: ukurannya identik supaya tata letak
      tidak bergeser, dan ikonnya netral karena temanya belum diketahui.
    -->
    <template #fallback>
      <UButton
        icon="i-lucide-sun-moon"
        :size="props.size"
        :variant="props.floating ? 'solid' : 'ghost'"
        color="neutral"
        :class="props.floating ? floatingClass : undefined"
        aria-label="Ganti tema"
        title="Ganti tema"
        data-theme-toggle
      />
    </template>
  </ClientOnly>
</template>
