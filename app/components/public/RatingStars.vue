<script setup lang="ts">
/**
 * Pilihan bintang 1–5 (§23).
 *
 * Dibuat dari elemen `<button>` sungguhan, bukan ikon yang diberi `@click`, supaya
 * bisa dijangkau keyboard dan pembaca layar — halaman ini dipakai siapa saja yang
 * baru saja dilayani, termasuk lewat ponsel bantu.
 */
const props = withDefaults(defineProps<{
  modelValue?: number
  readonly?: boolean
  size?: 'sm' | 'md' | 'lg'
}>(), { modelValue: 0, readonly: false, size: 'md' })

const emit = defineEmits<{ 'update:modelValue': [value: number] }>()

const RATING_LABELS: Record<number, string> = {
  1: 'Sangat Buruk',
  2: 'Buruk',
  3: 'Cukup',
  4: 'Baik',
  5: 'Sangat Baik',
}

/**
 * Bentuk bintang digambar sendiri, bukan lewat `UIcon`.
 *
 * Ikon Nuxt UI dirender sebagai CSS mask — warnanya datang dari `background-color`
 * dan bentuknya dari `mask-image`, sehingga properti `fill` tidak berpengaruh sama
 * sekali dan bintang terpilih tetap tampil sebagai garis. Lucide sendiri hanya
 * menyediakan bintang bergaris, tanpa varian padat.
 *
 * Jalur di bawah ini SAMA PERSIS dengan `i-lucide-star` supaya bentuknya tetap
 * seragam dengan ikon lain di aplikasi; yang berbeda hanya `fill`-nya, yang kini
 * benar-benar kita kendalikan.
 */
const STAR_PATH = 'M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.12 2.12 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.12 2.12 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.12 2.12 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.12 2.12 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.12 2.12 0 0 0 1.597-1.16z'

const hovered = ref(0)
const shown = computed(() => hovered.value || props.modelValue)

const sizeClass = computed(() => ({
  sm: 'size-5',
  md: 'size-8',
  lg: 'size-11',
}[props.size]))

function pick(value: number) {
  if (props.readonly) return
  emit('update:modelValue', value)
}
</script>

<template>
  <div class="flex flex-col items-center gap-1">
    <div class="flex items-center gap-1" @mouseleave="hovered = 0">
      <button
        v-for="star in 5"
        :key="star"
        type="button"
        :disabled="readonly"
        :aria-label="`${star} bintang — ${RATING_LABELS[star]}`"
        :aria-pressed="modelValue === star"
        class="rounded-full p-0.5 transition-transform"
        :class="readonly ? 'cursor-default' : 'hover:scale-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400'"
        @click="pick(star)"
        @mouseenter="hovered = readonly ? 0 : star"
      >
        <!--
          Bintang terpilih diisi penuh, yang belum terpilih tetap bergaris: yang
          membedakan bukan hanya warna, jadi nilainya masih terbaca pada layar
          monokrom maupun oleh mata yang sulit membedakan warna.
        -->
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          :class="[sizeClass, star <= shown ? 'text-amber-400' : 'text-slate-300 dark:text-slate-600']"
          :fill="star <= shown ? 'currentColor' : 'none'"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path :d="STAR_PATH" />
        </svg>
      </button>
    </div>

    <p v-if="shown && !readonly" class="text-sm font-medium text-slate-600 dark:text-slate-300">
      {{ RATING_LABELS[shown] }}
    </p>
  </div>
</template>
