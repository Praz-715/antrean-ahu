<script setup lang="ts">
defineProps<{
  title: string
  icon: string
  phase: string
  description: string
  features?: string[]
}>()
</script>

<template>
  <div>
    <UiPageHeading :title="title" :icon="icon" :description="description" />

    <div class="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center dark:border-slate-700 dark:bg-slate-900">
      <div class="mx-auto flex size-14 items-center justify-center rounded-2xl bg-slate-100 dark:bg-slate-800">
        <UIcon :name="icon" class="size-7 text-slate-400" />
      </div>

      <UBadge class="mt-4" variant="subtle" color="neutral" :label="phase" />

      <p class="mx-auto mt-3 max-w-lg text-slate-500">
        Bagian ini belum dibangun. Pengerjaan mengikuti urutan phase pada
        <code class="rounded bg-slate-100 px-1 py-0.5 text-xs dark:bg-slate-800">phase.md</code>
        supaya fondasi antrean selesai lebih dulu.
      </p>

      <ul v-if="features?.length" class="mx-auto mt-6 max-w-md space-y-2 text-left">
        <li v-for="feature in features" :key="feature" class="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-400">
          <UIcon name="i-lucide-circle-dashed" class="mt-0.5 size-4 shrink-0 text-slate-400" />
          {{ feature }}
        </li>
      </ul>
    </div>
  </div>
</template>
