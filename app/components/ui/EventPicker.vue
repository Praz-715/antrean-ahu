<script setup lang="ts">
import { EVENT_STATUS_COLOR, EVENT_STATUS_LABEL } from '#shared/utils/queue-format'

const { events, currentId, pending, loadEvents, setCurrent } = useCurrentEvent()

await loadEvents()

const items = computed(() =>
  events.value.map(e => ({
    label: e.name,
    value: e.id,
    status: e.status,
  })),
)

const selected = computed({
  get: () => items.value.find(i => i.value === currentId.value),
  set: (item) => { if (item) setCurrent(item.value) },
})
</script>

<template>
  <div class="flex items-center gap-2">
    <USelectMenu
      v-model="selected"
      :items="items"
      :loading="pending"
      :search-input="{ placeholder: 'Cari event…' }"
      placeholder="Pilih event"
      icon="i-lucide-calendar-days"
      class="w-64"
    >
      <template #item-trailing="{ item }">
        <UBadge
          :color="(EVENT_STATUS_COLOR[item.status] as never) ?? 'neutral'"
          variant="subtle"
          size="sm"
          :label="EVENT_STATUS_LABEL[item.status] ?? item.status"
        />
      </template>
    </USelectMenu>
  </div>
</template>
