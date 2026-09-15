<script setup lang="ts">
defineProps<{
  title: string
  description?: string
  icon?: string
}>()
</script>

<template>
  <div class="mb-6 flex flex-wrap items-start justify-between gap-4">
    <div class="flex items-start gap-3">
      <div
        v-if="icon"
        class="mt-0.5 flex size-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-950 dark:text-brand-300"
      >
        <UIcon :name="icon" class="size-5" />
      </div>
      <div>
        <h1 class="text-xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-2xl">
          {{ title }}
        </h1>
        <p v-if="description" class="mt-1 max-w-2xl text-sm text-slate-500">
          {{ description }}
        </p>
      </div>
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <slot name="actions" />
    </div>
  </div>
</template>
