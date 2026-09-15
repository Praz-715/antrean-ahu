<script setup lang="ts">
import { apiFetch } from '../../composables/useApi'
import { filterValue, SELECT_ALL } from '#shared/constants/ui'
import { QUEUE_STATUS_COLOR, QUEUE_STATUS_LABEL } from '#shared/utils/queue-format'
import { SOCKET_EVENTS } from '#shared/constants/socket'

definePageMeta({ layout: 'admin', middleware: 'admin' })
useHead({ title: 'Antrean Live' })

interface QueueRow {
  id: string
  queueNumber: string
  status: string
  createdAt: string
  calledAt: string | null
  finishedAt: string | null
  waitingSeconds: number | null
  serviceSeconds: number | null
  recallCount: number
  queueType: { id: string, code: string, name: string, color: string }
  counter: { name: string } | null
  operator: { name: string } | null
  visitor: { fullName: string | null, phone: string | null } | null
}

const route = useRoute()
const { currentId, loadEvents } = useCurrentEvent()
// Warna layanan dipilih admin; disesuaikan agar tetap terbaca di tema gelap.
const { readable } = useReadableColor()
await loadEvents()

const items = ref<QueueRow[]>([])
const total = ref(0)
const pending = ref(false)
const status = ref<string>((route.query.status as string) || SELECT_ALL)
const search = ref('')
const queueTypeId = ref(SELECT_ALL)
const queueTypes = ref<Array<{ id: string, code: string, name: string }>>([])

async function load() {
  if (!currentId.value) { items.value = []; return }
  pending.value = true
  try {
    const res = await apiFetch<{ items: QueueRow[], total: number }>('/api/admin/queues', {
      query: {
        eventId: currentId.value,
        ...(filterValue(status.value) ? { status: status.value } : {}),
        ...(filterValue(queueTypeId.value) ? { queueTypeId: queueTypeId.value } : {}),
        ...(search.value ? { search: search.value } : {}),
        perPage: 100,
      },
    })
    items.value = res.items
    total.value = res.total
  }
  finally { pending.value = false }
}

async function loadTypes() {
  if (!currentId.value) return
  queueTypes.value = await apiFetch('/api/admin/queue-types', { query: { eventId: currentId.value } })
}

watch(currentId, async () => { await Promise.all([load(), loadTypes()]) }, { immediate: true })
watch([status, queueTypeId], load)

let searchTimer: ReturnType<typeof setTimeout>
watch(search, () => { clearTimeout(searchTimer); searchTimer = setTimeout(load, 300) })

// Realtime: papan ikut berubah saat operator bekerja.
// `auth` dibaca sebagai fungsi agar penggantian event bisa memicu rejoin room.
const { connected, on, reconnect } = useSocket(() => ({
  role: 'admin' as const,
  eventId: currentId.value ?? undefined,
}))
watch(currentId, () => reconnect())
for (const name of [
  SOCKET_EVENTS.QUEUE_CREATED,
  SOCKET_EVENTS.QUEUE_CALLED,
  SOCKET_EVENTS.QUEUE_RECALLED,
  SOCKET_EVENTS.QUEUE_SKIPPED,
  SOCKET_EVENTS.QUEUE_COMPLETED,
  SOCKET_EVENTS.QUEUE_CANCELLED,
]) on(name, () => load())

const statusOptions = [
  { label: 'Semua status', value: SELECT_ALL },
  ...Object.entries(QUEUE_STATUS_LABEL).map(([value, label]) => ({ label, value })),
]

function duration(seconds: number | null) {
  if (seconds === null || seconds === undefined) return '–'
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return m ? `${m}m ${s}s` : `${s}s`
}

function timeOf(value: string | null) {
  return value ? new Date(value).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '–'
}

const summary = computed(() => {
  const counts: Record<string, number> = {}
  for (const item of items.value) counts[item.status] = (counts[item.status] ?? 0) + 1
  return counts
})
</script>

<template>
  <div>
    <UiPageHeading
      title="Antrean Live"
      icon="i-lucide-activity"
      description="Seluruh antrean hari ini pada event terpilih, diperbarui otomatis saat operator memanggil."
    >
      <template #actions>
        <span
          class="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
          :class="connected ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-slate-100 text-slate-500 dark:bg-slate-800'"
        >
          <span class="size-1.5 rounded-full" :class="connected ? 'bg-emerald-500' : 'bg-slate-400'" />
          {{ connected ? 'Live' : 'Terputus' }}
        </span>
        <UiEventPicker />
        <UButton icon="i-lucide-refresh-cw" aria-label="Muat ulang data" title="Muat ulang data" variant="outline" color="neutral" :loading="pending" @click="load" />
      </template>
    </UiPageHeading>

    <!-- Filter -->
    <div class="mb-4 flex flex-wrap gap-2">
      <UInput v-model="search" icon="i-lucide-search" placeholder="Cari nomor / nama / HP…" class="w-64" />
      <USelect v-model="status" :items="statusOptions" class="w-44" />
      <USelect
        v-model="queueTypeId"
        :items="[{ label: 'Semua layanan', value: SELECT_ALL }, ...queueTypes.map(t => ({ label: `${t.code} · ${t.name}`, value: t.id }))]"
        class="w-52"
      />
      <div class="ml-auto flex items-center gap-2 text-sm text-slate-500">
        <span v-for="(count, key) in summary" :key="key">
          <UBadge size="sm" variant="subtle" :color="(QUEUE_STATUS_COLOR[key] as never) ?? 'neutral'" :label="`${QUEUE_STATUS_LABEL[key] ?? key}: ${count}`" />
        </span>
      </div>
    </div>

    <div class="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <table class="w-full text-sm">
        <thead class="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-800/50">
          <tr>
            <th class="px-4 py-3 font-medium">
              Nomor
            </th>
            <th class="px-4 py-3 font-medium">
              Layanan
            </th>
            <th class="px-4 py-3 font-medium">
              Pengunjung
            </th>
            <th class="px-4 py-3 font-medium">
              Status
            </th>
            <th class="hidden px-4 py-3 font-medium lg:table-cell">
              Loket / Operator
            </th>
            <th class="hidden px-4 py-3 font-medium sm:table-cell">
              Ambil
            </th>
            <th class="hidden px-4 py-3 font-medium sm:table-cell">
              Tunggu
            </th>
            <th class="hidden px-4 py-3 font-medium lg:table-cell">
              Layanan
            </th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
          <tr v-if="!items.length">
            <td colspan="8" class="px-4 py-12 text-center text-slate-500">
              {{ pending ? 'Memuat…' : 'Belum ada antrean pada filter ini.' }}
            </td>
          </tr>
          <tr v-for="row in items" :key="row.id" class="hover:bg-slate-50 dark:hover:bg-slate-800/40">
            <td class="px-4 py-2.5">
              <span class="queue-number text-base" :style="{ color: readable(row.queueType.color) }">{{ row.queueNumber }}</span>
              <span v-if="row.recallCount" class="ml-1 text-xs text-slate-400">↻{{ row.recallCount }}</span>
            </td>
            <td class="px-4 py-2.5">
              <span class="rounded px-1.5 py-0.5 text-xs font-medium" :style="{ backgroundColor: row.queueType.color + '1a', color: readable(row.queueType.color) }">
                {{ row.queueType.code }}
              </span>
              <span class="ml-2 text-slate-600 dark:text-slate-300">{{ row.queueType.name }}</span>
            </td>
            <td class="px-4 py-2.5">
              <p class="truncate">
                {{ row.visitor?.fullName || '—' }}
              </p>
              <p v-if="row.visitor?.phone" class="text-xs text-slate-400">
                {{ row.visitor.phone }}
              </p>
            </td>
            <td class="px-4 py-2.5">
              <UBadge
                size="sm"
                variant="subtle"
                :color="(QUEUE_STATUS_COLOR[row.status] as never) ?? 'neutral'"
                :label="QUEUE_STATUS_LABEL[row.status] ?? row.status"
              />
            </td>
            <td class="hidden px-4 py-2.5 text-slate-500 lg:table-cell">
              <span v-if="row.counter || row.operator">
                {{ row.counter?.name ?? '—' }}<span v-if="row.operator"> · {{ row.operator.name }}</span>
              </span>
              <span v-else>—</span>
            </td>
            <td class="hidden px-4 py-2.5 text-slate-500 sm:table-cell">
              {{ timeOf(row.createdAt) }}
            </td>
            <td class="hidden px-4 py-2.5 text-slate-500 sm:table-cell">
              {{ duration(row.waitingSeconds) }}
            </td>
            <td class="hidden px-4 py-2.5 text-slate-500 lg:table-cell">
              {{ duration(row.serviceSeconds) }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <p class="mt-3 text-sm text-slate-500">
      Menampilkan {{ items.length }} dari {{ total }} antrean.
    </p>
  </div>
</template>
