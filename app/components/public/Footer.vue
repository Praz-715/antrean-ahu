<script setup lang="ts">
import type { PublicPageView } from '#shared/types/public-page'

/**
 * Penutup halaman: identitas penyelenggara dan asal sistemnya.
 *
 * Tiga barisnya bisa dimatikan sendiri-sendiri karena tidak semua instansi mau
 * mencantumkan logo di kaki halaman, dan sebagian memasang halaman ini dengan
 * merek sendiri.
 */
const props = defineProps<{ view: PublicPageView }>()

const cfg = computed(() => props.view.page.theme.footer)
const logo = computed(() => props.view.page.logoUrl || props.view.organization?.logoUrl || null)
const teks = computed(() => props.view.page.theme.footerText)
</script>

<template>
  <footer
    class="mt-12 border-t border-slate-200/80 py-8 dark:border-slate-800"
    style="background: linear-gradient(to bottom, transparent, color-mix(in srgb, var(--public-secondary) 6%, transparent))"
  >
    <div class="mx-auto flex w-full max-w-5xl flex-col items-center gap-3 px-5 text-center @2xl:px-8">
      <img v-if="cfg.showLogo && logo" :src="logo" alt="" class="h-9 w-auto object-contain opacity-90">

      <p v-if="teks" class="text-sm font-medium text-slate-700 dark:text-slate-200">
        {{ teks }}
      </p>

      <p v-if="cfg.showOrganization" class="text-sm text-slate-500">
        {{ view.organization?.name || view.event.name }}
      </p>

      <p v-if="cfg.showPoweredBy" class="text-xs text-slate-400">
        Ditenagai <span class="font-semibold">ANTREAN</span>
      </p>
    </div>
  </footer>
</template>
