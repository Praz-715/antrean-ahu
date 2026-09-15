<script setup lang="ts">
import { apiFetch } from '../../composables/useApi'
import { PERMISSIONS } from '#shared/constants/permissions'
import { SELECT_ALL, filterValue } from '#shared/constants/ui'
import { QUEUE_STATUS_LABEL } from '#shared/utils/queue-format'
import { todayInTimezone, addDays } from '#shared/utils/service-date'

definePageMeta({ layout: 'admin', middleware: 'admin' })
useHead({ title: 'Daftar Pengunjung' })

interface QueueBrief {
  id: string
  queueNumber: string
  status: string
  serviceDate: string
  queueType: { id: string, name: string, color: string }
}

interface VisitorRow {
  id: string
  fullName: string | null
  phone: string | null
  email: string | null
  identityNumber: string | null
  createdAt: string
  queues: QueueBrief[]
  _count: { queues: number }
}

interface VisitorDetail {
  id: string
  fullName: string | null
  phone: string | null
  email: string | null
  identityNumber: string | null
  ipAddress: string | null
  createdAt: string
  event: { id: string, name: string }
  answers: Array<{ key: string, label: string, type: string, value: unknown }>
  queues: Array<QueueBrief & {
    createdAt: string
    calledAt: string | null
    finishedAt: string | null
    serviceSeconds: number | null
    counter: { name: string } | null
    operator: { name: string } | null
    testimonial: { rating: number, comment: string | null, isApproved: boolean } | null
  }>
}

interface ListResponse {
  items: VisitorRow[]
  total: number
  page: number
  limit: number
  totalPages: number
}

const { can } = useMe()
const { call } = useApi()
const { current, currentId, loadEvents } = useCurrentEvent()
await loadEvents()

const timezone = computed(() => current.value?.timezone ?? 'Asia/Jakarta')

const search = ref('')
const queueTypeId = ref<string>(SELECT_ALL)
const from = ref(addDays(todayInTimezone(timezone.value), -30))
const to = ref(todayInTimezone(timezone.value))
const page = ref(1)

const data = ref<ListResponse | null>(null)
const pending = ref(false)

const queueTypes = ref<Array<{ id: string, name: string }>>([])

async function loadQueueTypes() {
  if (!currentId.value) { queueTypes.value = []; return }
  queueTypes.value = await apiFetch<Array<{ id: string, name: string }>>(
    '/api/admin/queue-types',
    { query: { eventId: currentId.value } },
  ).catch(() => [])
}

async function load() {
  if (!currentId.value) { data.value = null; return }
  pending.value = true
  try {
    data.value = await apiFetch<ListResponse>('/api/admin/visitors', {
      query: {
        eventId: currentId.value,
        ...(search.value.trim() ? { search: search.value.trim() } : {}),
        ...(filterValue(queueTypeId.value) ? { queueTypeId: queueTypeId.value } : {}),
        from: from.value,
        to: to.value,
        page: page.value,
        limit: 25,
      },
    })
  }
  finally { pending.value = false }
}

watch(currentId, async () => {
  from.value = addDays(todayInTimezone(timezone.value), -30)
  to.value = todayInTimezone(timezone.value)
  queueTypeId.value = SELECT_ALL
  page.value = 1
  await Promise.all([loadQueueTypes(), load()])
}, { immediate: true })

watch([queueTypeId, from, to], () => { page.value = 1; void load() })
watch(page, load)

let searchTimer: ReturnType<typeof setTimeout> | undefined
watch(search, () => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => { page.value = 1; void load() }, 350)
})
onBeforeUnmount(() => clearTimeout(searchTimer))

// ---- rincian ----
const detail = ref<VisitorDetail | null>(null)
const detailOpen = ref(false)
const detailPending = ref(false)

async function openDetail(row: VisitorRow) {
  detailOpen.value = true
  detailPending.value = true
  detail.value = null
  try {
    detail.value = await apiFetch<VisitorDetail>(`/api/admin/visitors/${row.id}`)
  }
  finally { detailPending.value = false }
}

const exporting = ref(false)
async function exportVisitors() {
  exporting.value = true
  await call(
    '/api/admin/exports',
    {
      method: 'POST',
      body: { type: 'VISITORS', format: 'XLSX', eventId: currentId.value, from: from.value, to: to.value },
    },
    'Ekspor diproses — pantau di halaman Laporan',
  )
  exporting.value = false
}

function displayValue(value: unknown) {
  if (value === null || value === undefined || value === '') return '—'
  if (Array.isArray(value)) return value.join(', ')
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function timeText(value: string) {
  return new Date(value).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function durationText(seconds: number | null) {
  if (!seconds) return '—'
  const minutes = Math.floor(seconds / 60)
  return minutes ? `${minutes} mnt ${seconds % 60} dtk` : `${seconds} dtk`
}

const statusClass: Record<string, string> = {
  WAITING: 'status-waiting',
  CALLED: 'status-called',
  SERVING: 'status-serving',
  COMPLETED: 'status-completed',
  SKIPPED: 'status-skipped',
  CANCELLED: 'status-cancelled',
  NO_SHOW: 'status-cancelled',
}
</script>

<template>
  <div>
    <UiPageHeading
      title="Daftar Pengunjung"
      icon="i-lucide-user-round"
      description="Setiap pengunjung yang pernah mengambil nomor, lengkap dengan jawaban formulir dan riwayat antreannya."
    >
      <template #actions>
        <UiEventPicker />
        <UButton
          v-if="can(PERMISSIONS.VISITOR_EXPORT)"
          variant="outline"
          color="neutral"
          icon="i-lucide-download"
          label="Ekspor"
          :loading="exporting"
          :disabled="!currentId"
          @click="exportVisitors"
        />
      </template>
    </UiPageHeading>

    <!-- Penyaring -->
    <div class="mb-4 grid gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 sm:grid-cols-2 lg:grid-cols-4">
      <UFormField label="Cari" size="sm">
        <UInput
          v-model="search"
          class="w-full"
          icon="i-lucide-search"
          placeholder="nama, HP, email, NIK, atau nomor antrean"
        />
      </UFormField>
      <UFormField label="Layanan" size="sm">
        <USelect
          v-model="queueTypeId"
          class="w-full"
          :items="[
            { label: 'Semua layanan', value: SELECT_ALL },
            ...queueTypes.map(t => ({ label: t.name, value: t.id })),
          ]"
        />
      </UFormField>
      <UFormField label="Dari tanggal" size="sm">
        <UInput v-model="from" type="date" class="w-full" aria-label="Dari tanggal" />
      </UFormField>
      <UFormField label="Sampai tanggal" size="sm">
        <UInput v-model="to" type="date" class="w-full" aria-label="Sampai tanggal" />
      </UFormField>
    </div>

    <div v-if="pending && !data" class="space-y-3">
      <USkeleton v-for="i in 4" :key="i" class="h-16 w-full" />
    </div>

    <div
      v-else-if="!data?.items.length"
      class="rounded-xl border border-dashed border-slate-300 py-16 text-center dark:border-slate-700"
    >
      <UIcon name="i-lucide-user-round-search" class="mx-auto size-10 text-slate-400" />
      <p class="mt-3 font-medium">
        Tidak ada pengunjung pada rentang ini
      </p>
      <p class="mx-auto mt-1 max-w-md text-sm text-slate-500">
        Ubah rentang tanggal atau kata kunci pencarian.
      </p>
    </div>

    <div v-else class="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800/60">
            <tr>
              <th class="px-4 py-3 font-medium">
                Pengunjung
              </th>
              <th class="px-4 py-3 font-medium">
                Kontak
              </th>
              <th class="px-4 py-3 font-medium">
                Antrean Terakhir
              </th>
              <th class="px-4 py-3 text-right font-medium">
                Total
              </th>
              <th class="px-4 py-3" />
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
            <tr
              v-for="row in data.items"
              :key="row.id"
              class="cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50"
              @click="openDetail(row)"
            >
              <td class="px-4 py-3">
                <p class="font-medium">
                  {{ row.fullName || 'Tanpa nama' }}
                </p>
                <p class="text-xs text-slate-400">
                  {{ row.identityNumber || '—' }} · terdaftar {{ timeText(row.createdAt) }}
                </p>
              </td>
              <td class="px-4 py-3 text-slate-600 dark:text-slate-300">
                <p>{{ row.phone || '—' }}</p>
                <p class="text-xs text-slate-400">
                  {{ row.email || '—' }}
                </p>
              </td>
              <td class="px-4 py-3">
                <div class="flex flex-wrap items-center gap-1.5">
                  <span
                    v-for="queue in row.queues"
                    :key="queue.id"
                    class="rounded-full px-2 py-0.5 text-xs font-semibold"
                    :class="statusClass[queue.status] ?? 'status-waiting'"
                  >{{ queue.queueNumber }}</span>
                  <span v-if="!row.queues.length" class="text-xs text-slate-400">—</span>
                </div>
              </td>
              <td class="px-4 py-3 text-right tabular-nums text-slate-500">
                {{ row._count.queues }}
              </td>
              <td class="px-4 py-3 text-right">
                <UIcon name="i-lucide-chevron-right" class="size-4 text-slate-400" />
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if="data.totalPages > 1" class="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 dark:border-slate-800">
        <p class="text-sm text-slate-500">
          Halaman {{ data.page }} dari {{ data.totalPages }} · {{ data.total }} pengunjung
        </p>
        <UPagination v-model:page="page" :total="data.total" :items-per-page="data.limit" />
      </div>
    </div>

    <!-- Rincian pengunjung -->
    <UModal
      v-model:open="detailOpen"
      title="Rincian Pengunjung"
      description="Jawaban formulir dan seluruh riwayat antrean pengunjung ini."
      :ui="{ content: 'max-w-2xl' }"
    >
      <template #body>
        <div v-if="detailPending" class="space-y-3">
          <USkeleton class="h-24 w-full" />
          <USkeleton class="h-32 w-full" />
        </div>

        <div v-else-if="detail" class="space-y-5">
          <div class="rounded-xl bg-slate-50 p-4 dark:bg-slate-800/50">
            <p class="text-lg font-semibold">
              {{ detail.fullName || 'Tanpa nama' }}
            </p>
            <dl class="mt-2 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
              <div class="flex gap-2">
                <dt class="text-slate-500">
                  Nomor HP
                </dt>
                <dd>{{ detail.phone || '—' }}</dd>
              </div>
              <div class="flex gap-2">
                <dt class="text-slate-500">
                  Email
                </dt>
                <dd class="truncate">
                  {{ detail.email || '—' }}
                </dd>
              </div>
              <div class="flex gap-2">
                <dt class="text-slate-500">
                  Identitas
                </dt>
                <dd>{{ detail.identityNumber || '—' }}</dd>
              </div>
              <div class="flex gap-2">
                <dt class="text-slate-500">
                  Terdaftar
                </dt>
                <dd>{{ timeText(detail.createdAt) }}</dd>
              </div>
            </dl>
          </div>

          <div>
            <h3 class="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Jawaban Formulir
            </h3>
            <div v-if="!detail.answers.length" class="rounded-lg border border-dashed border-slate-300 p-4 text-center text-sm text-slate-400 dark:border-slate-700">
              Pengunjung ini mengambil antrean tanpa mengisi formulir.
            </div>
            <dl v-else class="divide-y divide-slate-100 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
              <div v-for="answer in detail.answers" :key="answer.key" class="flex flex-wrap gap-2 px-3 py-2 text-sm">
                <dt class="min-w-40 text-slate-500">
                  {{ answer.label }}
                </dt>
                <dd class="flex-1 font-medium">
                  {{ displayValue(answer.value) }}
                </dd>
              </div>
            </dl>
          </div>

          <div>
            <h3 class="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Riwayat Antrean ({{ detail.queues.length }})
            </h3>
            <div class="space-y-2">
              <div
                v-for="queue in detail.queues"
                :key="queue.id"
                class="rounded-lg border border-slate-200 p-3 dark:border-slate-800"
              >
                <div class="flex flex-wrap items-center gap-2">
                  <span class="queue-number text-lg">{{ queue.queueNumber }}</span>
                  <span
                    class="rounded-full px-2 py-0.5 text-xs font-semibold"
                    :class="statusClass[queue.status] ?? 'status-waiting'"
                  >{{ QUEUE_STATUS_LABEL[queue.status] ?? queue.status }}</span>
                  <span
                    class="rounded-full px-2 py-0.5 text-xs font-medium text-white"
                    :style="{ backgroundColor: queue.queueType.color }"
                  >{{ queue.queueType.name }}</span>
                </div>
                <p class="mt-1 text-xs text-slate-400">
                  {{ queue.serviceDate }} · diambil {{ timeText(queue.createdAt) }}
                  <template v-if="queue.counter"> · {{ queue.counter.name }}</template>
                  <template v-if="queue.operator"> · {{ queue.operator.name }}</template>
                  <template v-if="queue.serviceSeconds"> · lama layanan {{ durationText(queue.serviceSeconds) }}</template>
                </p>
                <p v-if="queue.testimonial" class="mt-1 text-xs text-amber-600 dark:text-amber-400">
                  Rating {{ queue.testimonial.rating }}/5
                  <template v-if="queue.testimonial.comment"> — "{{ queue.testimonial.comment }}"</template>
                </p>
              </div>
            </div>
          </div>
        </div>
      </template>

      <template #footer="{ close }">
        <div class="flex w-full justify-end">
          <UButton variant="ghost" color="neutral" label="Tutup" @click="close" />
        </div>
      </template>
    </UModal>
  </div>
</template>
