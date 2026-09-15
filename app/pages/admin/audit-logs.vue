<script setup lang="ts">
import { apiFetch } from '../../composables/useApi'
import { filterValue, SELECT_ALL } from '#shared/constants/ui'

definePageMeta({ layout: 'admin', middleware: 'admin' })
useHead({ title: 'Audit Log' })

interface AuditRow {
  id: string
  action: string
  entity: string
  entityId: string | null
  oldData: Record<string, unknown> | null
  newData: Record<string, unknown> | null
  ipAddress: string | null
  userAgent: string | null
  createdAt: string
  user: { id: string, name: string, email: string } | null
}

interface AuditResponse {
  items: AuditRow[]
  total: number
  page: number
  totalPages: number
  filters: {
    actions: Array<{ value: string, count: number }>
    entities: Array<{ value: string, count: number }>
    users: Array<{ id: string, name: string }>
  }
}

const action = ref(SELECT_ALL)
const entity = ref(SELECT_ALL)
const userId = ref(SELECT_ALL)
const search = ref('')
const page = ref(1)

const data = ref<AuditResponse | null>(null)
const pending = ref(false)

function buildQuery() {
  return {
    ...(filterValue(action.value) ? { action: action.value } : {}),
    ...(filterValue(entity.value) ? { entity: entity.value } : {}),
    ...(filterValue(userId.value) ? { userId: userId.value } : {}),
    ...(search.value ? { search: search.value } : {}),
    page: page.value,
    perPage: 50,
  }
}

async function load() {
  pending.value = true
  try {
    data.value = await apiFetch<AuditResponse>('/api/admin/audit-logs', { query: buildQuery() })
  }
  finally { pending.value = false }
}

/**
 * Muat pertama lewat `useAsyncData` — bukan `load()` langsung.
 *
 * Hasilnya ikut terkirim sebagai payload SSR dan dipakai ulang saat hidrasi. Kalau
 * klien mengambil ulang sendiri, daftarnya sudah berbeda dari yang dirender server
 * (audit log bertambah tiap ada aktivitas), dan Vue melaporkannya sebagai hydration
 * mismatch lalu membuang DOM yang sudah jadi. Halaman inilah yang paling terasa
 * karena isinya berubah setiap detik.
 */
const { data: initial } = await useAsyncData('admin-audit-logs', () =>
  apiFetch<AuditResponse>('/api/admin/audit-logs', { query: buildQuery() }))
data.value = initial.value ?? null

watch([action, entity, userId], () => { page.value = 1; void load() })
watch(page, load)

let searchTimer: ReturnType<typeof setTimeout>
watch(search, () => { clearTimeout(searchTimer); page.value = 1; searchTimer = setTimeout(load, 300) })

function resetFilters() {
  action.value = SELECT_ALL
  entity.value = SELECT_ALL
  userId.value = SELECT_ALL
  search.value = ''
  page.value = 1
}

const detail = ref<AuditRow | null>(null)

function timeLabel(value: string) {
  return new Date(value).toLocaleString('id-ID', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

/** Warna badge per kelompok aksi supaya baris penting mudah dipindai. */
function actionColor(value: string) {
  if (value.includes('DELETE')) return 'error'
  if (value.includes('CREATE') || value.includes('CREATED')) return 'success'
  if (value.includes('CALLED') || value.includes('RECALLED')) return 'info'
  if (value.includes('SKIP') || value.includes('CANCEL') || value.includes('PAUSED')) return 'warning'
  return 'neutral'
}

function hasDiff(row: AuditRow) {
  return !!(row.oldData || row.newData)
}
</script>

<template>
  <div>
    <UiPageHeading
      title="Audit Log"
      icon="i-lucide-scroll-text"
      :description="data ? `${data.total.toLocaleString('id-ID')} aktivitas tercatat` : 'Jejak seluruh aktivitas penting di sistem.'"
    >
      <template #actions>
        <UButton icon="i-lucide-refresh-cw" aria-label="Muat ulang data" title="Muat ulang data" variant="outline" color="neutral" :loading="pending" @click="load" />
      </template>
    </UiPageHeading>

    <!-- Filter -->
    <div class="mb-4 flex flex-wrap gap-2">
      <UInput v-model="search" icon="i-lucide-search" placeholder="Cari aksi / ID entitas…" class="w-60" />
      <USelect
        v-model="action"
        :items="[
          { label: 'Semua aksi', value: SELECT_ALL },
          ...(data?.filters.actions ?? []).map(a => ({ label: `${a.value} (${a.count})`, value: a.value })),
        ]"
        class="w-56"
      />
      <USelect
        v-model="entity"
        :items="[
          { label: 'Semua entitas', value: SELECT_ALL },
          ...(data?.filters.entities ?? []).map(e => ({ label: `${e.value} (${e.count})`, value: e.value })),
        ]"
        class="w-48"
      />
      <USelect
        v-model="userId"
        :items="[
          { label: 'Semua pengguna', value: SELECT_ALL },
          ...(data?.filters.users ?? []).map(u => ({ label: u.name, value: u.id })),
        ]"
        class="w-48"
      />
      <UButton
        v-if="filterValue(action) || filterValue(entity) || filterValue(userId) || search"
        variant="ghost"
        color="neutral"
        icon="i-lucide-x"
        label="Reset"
        @click="resetFilters"
      />
    </div>

    <div class="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <table class="w-full text-sm">
        <thead class="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-800/50">
          <tr>
            <th class="px-4 py-3 font-medium">
              Waktu
            </th>
            <th class="px-4 py-3 font-medium">
              Aksi
            </th>
            <th class="px-4 py-3 font-medium">
              Entitas
            </th>
            <th class="px-4 py-3 font-medium">
              Pengguna
            </th>
            <th class="hidden px-4 py-3 font-medium lg:table-cell">
              IP
            </th>
            <th class="w-24 px-4 py-3" />
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
          <tr v-if="!data?.items.length">
            <td colspan="6" class="px-4 py-12 text-center text-slate-500">
              {{ pending ? 'Memuat…' : 'Tidak ada aktivitas pada filter ini.' }}
            </td>
          </tr>
          <tr v-for="row in data?.items ?? []" :key="row.id" class="hover:bg-slate-50 dark:hover:bg-slate-800/40">
            <td class="whitespace-nowrap px-4 py-2.5 text-slate-500">
              {{ timeLabel(row.createdAt) }}
            </td>
            <td class="px-4 py-2.5">
              <UBadge size="sm" variant="subtle" :color="actionColor(row.action) as never" :label="row.action" />
            </td>
            <td class="px-4 py-2.5">
              <span>{{ row.entity }}</span>
              <span v-if="row.entityId" class="ml-1 font-mono text-xs text-slate-400">
                {{ row.entityId.slice(-8) }}
              </span>
            </td>
            <td class="px-4 py-2.5">
              <span v-if="row.user">{{ row.user.name }}</span>
              <span v-else class="text-slate-400">sistem / publik</span>
            </td>
            <td class="hidden px-4 py-2.5 font-mono text-xs text-slate-400 lg:table-cell">
              {{ row.ipAddress ?? '–' }}
            </td>
            <td class="px-4 py-2.5 text-right">
              <UButton
                v-if="hasDiff(row)"
                size="xs"
                variant="ghost"
                color="neutral"
                icon="i-lucide-search"
                label="Rincian"
                @click="detail = row"
              />
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="data && data.totalPages > 1" class="mt-3 flex items-center justify-between">
      <p class="text-sm text-slate-500">
        Halaman {{ data.page }} dari {{ data.totalPages }}
      </p>
      <div class="flex gap-2">
        <UButton size="sm" variant="outline" color="neutral" icon="i-lucide-chevron-left" aria-label="Halaman sebelumnya" title="Halaman sebelumnya" :disabled="page <= 1" @click="page--" />
        <UButton size="sm" variant="outline" color="neutral" icon="i-lucide-chevron-right" aria-label="Halaman berikutnya" title="Halaman berikutnya" :disabled="page >= data.totalPages" @click="page++" />
      </div>
    </div>

    <!-- Rincian perubahan -->
    <UModal
      :open="!!detail"
      :title="detail?.action"
      :description="detail ? `${detail.entity} · ${timeLabel(detail.createdAt)}` : ''"
      :ui="{ content: 'sm:max-w-3xl' }"
      @update:open="(v) => { if (!v) detail = null }"
    >
      <template #body>
        <div class="space-y-4 text-sm">
          <div class="grid gap-3 sm:grid-cols-2">
            <div>
              <p class="text-xs uppercase tracking-wide text-slate-500">
                Pengguna
              </p>
              <p>{{ detail?.user?.name ?? 'sistem / publik' }}</p>
              <p class="text-xs text-slate-400">
                {{ detail?.user?.email }}
              </p>
            </div>
            <div>
              <p class="text-xs uppercase tracking-wide text-slate-500">
                Asal
              </p>
              <p class="font-mono text-xs">
                {{ detail?.ipAddress ?? '–' }}
              </p>
              <p class="truncate text-xs text-slate-400" :title="detail?.userAgent ?? ''">
                {{ detail?.userAgent ?? '' }}
              </p>
            </div>
          </div>

          <div class="grid gap-3 sm:grid-cols-2">
            <div v-if="detail?.oldData">
              <p class="mb-1 text-xs uppercase tracking-wide text-slate-500">
                Sebelum
              </p>
              <pre class="max-h-64 overflow-auto rounded-lg bg-rose-50 p-3 text-xs dark:bg-rose-950/40">{{ JSON.stringify(detail.oldData, null, 2) }}</pre>
            </div>
            <div v-if="detail?.newData">
              <p class="mb-1 text-xs uppercase tracking-wide text-slate-500">
                Sesudah
              </p>
              <pre class="max-h-64 overflow-auto rounded-lg bg-emerald-50 p-3 text-xs dark:bg-emerald-950/40">{{ JSON.stringify(detail.newData, null, 2) }}</pre>
            </div>
          </div>

          <p v-if="detail?.entityId" class="text-xs text-slate-400">
            ID entitas: <span class="font-mono">{{ detail.entityId }}</span>
          </p>
        </div>
      </template>
    </UModal>
  </div>
</template>
