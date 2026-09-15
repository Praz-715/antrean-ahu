<script setup lang="ts">
import { apiFetch } from '../../composables/useApi'
import { filterValue, SELECT_ALL } from '#shared/constants/ui'
import { QUEUE_STATUS_COLOR, QUEUE_STATUS_LABEL } from '#shared/utils/queue-format'
import { addDays, todayInTimezone } from '#shared/utils/service-date'

definePageMeta({ layout: 'admin', middleware: 'admin' })
useHead({ title: 'Riwayat Antrean' })

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

const { current, currentId, loadEvents } = useCurrentEvent()
// Warna layanan dipilih admin; disesuaikan agar tetap terbaca di tema gelap.
const { readable } = useReadableColor()
await loadEvents()

// tanggal layanan mengikuti zona waktu event, bukan UTC
const today = computed(() => todayInTimezone(current.value?.timezone))
const date = ref(today.value)

watch(() => current.value?.timezone, () => { date.value = today.value })
const status = ref(SELECT_ALL)
const search = ref('')
const page = ref(1)
const perPage = 50

const items = ref<QueueRow[]>([])
const total = ref(0)
const totalPages = ref(0)
const pending = ref(false)

async function load() {
  if (!currentId.value) { items.value = []; return }
  pending.value = true
  try {
    const res = await apiFetch<{ items: QueueRow[], total: number, totalPages: number }>('/api/admin/queues', {
      query: {
        eventId: currentId.value,
        date: date.value,
        ...(filterValue(status.value) ? { status: status.value } : {}),
        ...(search.value ? { search: search.value } : {}),
        page: page.value,
        perPage,
      },
    })
    items.value = res.items
    total.value = res.total
    totalPages.value = res.totalPages
  }
  finally { pending.value = false }
}

watch([currentId, date, status, page], load, { immediate: true })
let searchTimer: ReturnType<typeof setTimeout>
watch(search, () => { clearTimeout(searchTimer); page.value = 1; searchTimer = setTimeout(load, 300) })

const statusOptions = [
  { label: 'Semua status', value: SELECT_ALL },
  ...Object.entries(QUEUE_STATUS_LABEL).map(([value, label]) => ({ label, value })),
]

function duration(seconds: number | null) {
  if (seconds === null || seconds === undefined) return '–'
  const m = Math.floor(seconds / 60)
  return m ? `${m}m ${seconds % 60}s` : `${seconds}s`
}

function timeOf(value: string | null) {
  return value ? new Date(value).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '–'
}

function shiftDate(days: number) {
  date.value = addDays(date.value, days)
  page.value = 1
}
</script>

<template>
  <div>
    <UiPageHeading
      title="Riwayat Antrean"
      icon="i-lucide-history"
      description="Nomor antrean direset tiap hari, tetapi riwayatnya tersimpan permanen per tanggal layanan."
    >
      <template #actions>
        <UiEventPicker />
      </template>
    </UiPageHeading>

    <div class="mb-4 flex flex-wrap items-center gap-2">
      <UButton icon="i-lucide-chevron-left" aria-label="Hari sebelumnya" title="Hari sebelumnya" variant="outline" color="neutral" @click="shiftDate(-1)" />
      <UInput v-model="date" type="date" class="w-44" aria-label="Tanggal layanan" title="Tanggal layanan" />
      <UButton icon="i-lucide-chevron-right" aria-label="Hari berikutnya" title="Hari berikutnya" variant="outline" color="neutral" :disabled="date >= today" @click="shiftDate(1)" />
      <UButton variant="ghost" color="neutral" label="Hari ini" :disabled="date === today" @click="date = today" />

      <USelect v-model="status" :items="statusOptions" class="w-44" />
      <UInput v-model="search" icon="i-lucide-search" placeholder="Cari nomor / nama…" class="w-56" />
      <UButton class="ml-auto" icon="i-lucide-refresh-cw" aria-label="Muat ulang data" title="Muat ulang data" variant="outline" color="neutral" :loading="pending" @click="load" />
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
              Operator
            </th>
            <th class="hidden px-4 py-3 font-medium sm:table-cell">
              Ambil
            </th>
            <th class="hidden px-4 py-3 font-medium sm:table-cell">
              Selesai
            </th>
            <th class="hidden px-4 py-3 font-medium lg:table-cell">
              Tunggu / Layanan
            </th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
          <tr v-if="!items.length">
            <td colspan="8" class="px-4 py-12 text-center text-slate-500">
              {{ pending ? 'Memuat…' : 'Tidak ada antrean pada tanggal ini.' }}
            </td>
          </tr>
          <tr v-for="row in items" :key="row.id" class="hover:bg-slate-50 dark:hover:bg-slate-800/40">
            <td class="px-4 py-2.5">
              <span class="queue-number text-base" :style="{ color: readable(row.queueType.color) }">{{ row.queueNumber }}</span>
            </td>
            <td class="px-4 py-2.5 text-slate-600 dark:text-slate-300">
              {{ row.queueType.name }}
            </td>
            <td class="px-4 py-2.5">
              {{ row.visitor?.fullName || '—' }}
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
              {{ row.operator?.name ?? '—' }}
            </td>
            <td class="hidden px-4 py-2.5 text-slate-500 sm:table-cell">
              {{ timeOf(row.createdAt) }}
            </td>
            <td class="hidden px-4 py-2.5 text-slate-500 sm:table-cell">
              {{ timeOf(row.finishedAt) }}
            </td>
            <td class="hidden px-4 py-2.5 text-slate-500 lg:table-cell">
              {{ duration(row.waitingSeconds) }} / {{ duration(row.serviceSeconds) }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="mt-3 flex items-center justify-between">
      <p class="text-sm text-slate-500">
        {{ total }} antrean pada {{ date }}
      </p>
      <div v-if="totalPages > 1" class="flex items-center gap-2">
        <UButton size="sm" variant="outline" color="neutral" icon="i-lucide-chevron-left" aria-label="Halaman sebelumnya" title="Halaman sebelumnya" :disabled="page <= 1" @click="page--" />
        <span class="text-sm text-slate-500">{{ page }} / {{ totalPages }}</span>
        <UButton size="sm" variant="outline" color="neutral" icon="i-lucide-chevron-right" aria-label="Halaman berikutnya" title="Halaman berikutnya" :disabled="page >= totalPages" @click="page++" />
      </div>
    </div>
  </div>
</template>
