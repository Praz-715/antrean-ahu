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
        <UIcon
          :name="star <= shown ? 'i-lucide-star' : 'i-lucide-star'"
          :class="[sizeClass, star <= shown ? 'text-amber-400' : 'text-slate-300 dark:text-slate-600']"
          :style="star <= shown ? { fill: 'currentColor' } : undefined"
        />
      </button>
    </div>

    <p v-if="shown && !readonly" class="text-sm font-medium text-slate-600 dark:text-slate-300">
      {{ RATING_LABELS[shown] }}
    </p>
  </div>
</template>
