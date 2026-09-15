<script setup lang="ts">
import { apiFetch } from '../../composables/useApi'
import { EVENT_STATUS_COLOR, EVENT_STATUS_LABEL } from '#shared/utils/queue-format'

definePageMeta({ layout: 'admin', middleware: 'admin' })
useHead({ title: 'Dashboard' })

interface DashboardData {
  serviceDate: string
  event: { id: string, name: string, status: string, timezone: string }
  totals: {
    visitors: number
    queues: number
    waiting: number
    calledOrServing: number
    completed: number
    skipped: number
    cancelled: number
    noShow: number
  }
  averages: { waitingSeconds: number | null, serviceSeconds: number | null, satisfaction: number | null, ratingCount: number }
  byQueueType: Array<{ id: string, code: string, name: string, color: string, total: number, waiting: number, completed: number, skipped: number, currentNumber: string | null }>
  hourly: Array<{ hour: number, count: number }>
}

const { currentId, loadEvents } = useCurrentEvent()
// Warna layanan dipilih admin; disesuaikan agar tetap terbaca di tema gelap.
const { readable } = useReadableColor()
await loadEvents()

const data = ref<DashboardData | null>(null)
const pending = ref(false)

async function load() {
  if (!currentId.value) { data.value = null; return }
  pending.value = true
  try {
    data.value = await apiFetch<DashboardData>('/api/admin/dashboard', { query: { eventId: currentId.value } })
  }
  finally {
    pending.value = false
  }
}

watch(currentId, load, { immediate: true })

function minutes(seconds: number | null | undefined) {
  if (seconds === null || seconds === undefined) return '–'
  const m = Math.round(seconds / 60)
  return m < 1 ? '<1m' : `${m}m`
}

const cards = computed(() => {
  const t = data.value?.totals
  return [
    { label: 'Total Antrean', value: t?.queues ?? 0, icon: 'i-lucide-list-ordered', tone: 'text-slate-600 bg-slate-100 dark:bg-slate-800 dark:text-slate-300' },
    { label: 'Menunggu', value: t?.waiting ?? 0, icon: 'i-lucide-hourglass', tone: 'text-amber-700 bg-amber-100 dark:bg-amber-950 dark:text-amber-300' },
    { label: 'Sedang Dilayani', value: t?.calledOrServing ?? 0, icon: 'i-lucide-megaphone', tone: 'text-blue-700 bg-blue-100 dark:bg-blue-950 dark:text-blue-300' },
    { label: 'Selesai', value: t?.completed ?? 0, icon: 'i-lucide-check-check', tone: 'text-emerald-700 bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-300' },
    { label: 'Dilewati', value: t?.skipped ?? 0, icon: 'i-lucide-skip-forward', tone: 'text-orange-700 bg-orange-100 dark:bg-orange-950 dark:text-orange-300' },
    { label: 'Dibatalkan', value: t?.cancelled ?? 0, icon: 'i-lucide-x-circle', tone: 'text-rose-700 bg-rose-100 dark:bg-rose-950 dark:text-rose-300' },
  ]
})

const maxHourly = computed(() => Math.max(1, ...(data.value?.hourly.map(h => h.count) ?? [1])))
</script>

<template>
  <div>
    <UiPageHeading
      title="Dashboard"
      icon="i-lucide-layout-dashboard"
      :description="data ? `Ringkasan layanan ${data.serviceDate}` : 'Ringkasan operasional hari ini'"
    >
      <template #actions>
        <UiEventPicker />
        <UButton icon="i-lucide-refresh-cw" aria-label="Muat ulang data" title="Muat ulang data" variant="outline" color="neutral" :loading="pending" @click="load()" />
      </template>
    </UiPageHeading>

    <UAlert
      v-if="!currentId"
      color="warning"
      variant="soft"
      icon="i-lucide-info"
      title="Belum ada event"
      description="Buat event terlebih dahulu untuk mulai mengelola antrean."
      :actions="[{ label: 'Buat Event', to: '/admin/events', color: 'warning' }]"
    />

    <template v-else>
      <!-- Status event -->
      <div class="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div class="flex-1">
          <p class="text-sm text-slate-500">
            Event aktif
          </p>
          <p class="text-lg font-semibold">
            {{ data?.event.name ?? '—' }}
          </p>
        </div>
        <UBadge
          v-if="data"
          size="lg"
          variant="subtle"
          :color="(EVENT_STATUS_COLOR[data.event.status] as never) ?? 'neutral'"
          :label="EVENT_STATUS_LABEL[data.event.status] ?? data.event.status"
        />
        <UButton
          v-if="data"
          :to="`/admin/events/${data.event.id}`"
          variant="outline"
          color="neutral"
          icon="i-lucide-settings-2"
          label="Kelola event"
        />
      </div>

      <!-- Kartu statistik -->
      <div class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <div
          v-for="card in cards"
          :key="card.label"
          class="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
        >
          <div class="mb-3 flex size-9 items-center justify-center rounded-lg" :class="card.tone">
            <UIcon :name="card.icon" class="size-4.5" />
          </div>
          <USkeleton v-if="pending && !data" class="h-8 w-16" />
          <p v-else class="text-2xl font-bold tabular-nums">
            {{ card.value.toLocaleString('id-ID') }}
          </p>
          <p class="mt-0.5 text-xs text-slate-500">
            {{ card.label }}
          </p>
        </div>
      </div>

      <!-- Rata-rata -->
      <div class="mt-4 grid gap-4 md:grid-cols-3">
        <div class="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <p class="text-xs uppercase tracking-wide text-slate-500">
            Rata-rata Menunggu
          </p>
          <p class="mt-1 text-2xl font-bold">
            {{ minutes(data?.averages.waitingSeconds) }}
          </p>
        </div>
        <div class="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <p class="text-xs uppercase tracking-wide text-slate-500">
            Rata-rata Layanan
          </p>
          <p class="mt-1 text-2xl font-bold">
            {{ minutes(data?.averages.serviceSeconds) }}
          </p>
        </div>
        <div class="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <p class="text-xs uppercase tracking-wide text-slate-500">
            Kepuasan
          </p>
          <p class="mt-1 text-2xl font-bold">
            {{ data?.averages.satisfaction ? `${data.averages.satisfaction.toFixed(1)} / 5` : '–' }}
            <span class="text-sm font-normal text-slate-400">({{ data?.averages.ratingCount ?? 0 }})</span>
          </p>
        </div>
      </div>

      <div class="mt-6 grid gap-6 lg:grid-cols-3">
        <!-- Per jenis antrean -->
        <div class="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 lg:col-span-2">
          <h2 class="mb-4 font-semibold">
            Per Jenis Antrean
          </h2>

          <div v-if="!data?.byQueueType.length" class="py-8 text-center text-sm text-slate-500">
            Belum ada jenis antrean pada event ini.
          </div>

          <div v-else class="space-y-3">
            <div
              v-for="qt in data.byQueueType"
              :key="qt.id"
              class="flex flex-wrap items-center gap-4 rounded-lg border border-slate-100 p-3 dark:border-slate-800"
            >
              <div class="size-9 rounded-lg" :style="{ backgroundColor: qt.color + '22', color: readable(qt.color) }">
                <div class="flex size-full items-center justify-center text-sm font-bold">
                  {{ qt.code }}
                </div>
              </div>
              <div class="min-w-32 flex-1">
                <p class="font-medium">
                  {{ qt.name }}
                </p>
                <p class="text-xs text-slate-500">
                  {{ qt.total }} antrean hari ini
                </p>
              </div>
              <div class="text-center">
                <p class="text-xs text-slate-500">
                  Sedang dilayani
                </p>
                <p class="queue-number text-lg" :style="{ color: readable(qt.color) }">
                  {{ qt.currentNumber ?? '–' }}
                </p>
              </div>
              <div class="flex gap-4 text-center text-sm">
                <div>
                  <p class="font-semibold text-amber-600">
                    {{ qt.waiting }}
                  </p>
                  <p class="text-xs text-slate-500">
                    menunggu
                  </p>
                </div>
                <div>
                  <p class="font-semibold text-emerald-600">
                    {{ qt.completed }}
                  </p>
                  <p class="text-xs text-slate-500">
                    selesai
                  </p>
                </div>
                <div>
                  <p class="font-semibold text-orange-600">
                    {{ qt.skipped }}
                  </p>
                  <p class="text-xs text-slate-500">
                    dilewati
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Volume per jam -->
        <div class="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <h2 class="mb-4 font-semibold">
            Volume per Jam
          </h2>
          <div v-if="!data?.hourly.length" class="py-8 text-center text-sm text-slate-500">
            Belum ada antrean hari ini.
          </div>
          <div v-else class="flex h-48 items-end gap-1">
            <div
              v-for="h in data.hourly"
              :key="h.hour"
              class="flex flex-1 flex-col items-center gap-1"
            >
              <div
                class="w-full rounded-t bg-brand-500 transition-all"
                :style="{ height: `${Math.max(4, (h.count / maxHourly) * 160)}px` }"
                :title="`${h.hour}:00 — ${h.count} antrean`"
              />
              <span class="text-[10px] text-slate-400">{{ h.hour }}</span>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
