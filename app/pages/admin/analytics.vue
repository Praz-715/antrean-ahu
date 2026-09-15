<script setup lang="ts">
import { apiFetch } from '../../composables/useApi'
import { filterValue, SELECT_ALL } from '#shared/constants/ui'
import { addDays, todayInTimezone } from '#shared/utils/service-date'
import type { EChartsOption } from 'echarts'

definePageMeta({ layout: 'admin', middleware: 'admin' })
useHead({ title: 'Analytics' })

interface Analytics {
  range: { from: string, to: string, days: number }
  event: { id: string, name: string, timezone: string }
  totals: { queues: number, visitors: number, completed: number, skipped: number, cancelled: number, noShow: number, waiting: number }
  averages: { waitingSeconds: number | null, serviceSeconds: number | null, servedCount: number, satisfaction: number | null, ratingCount: number }
  daily: Array<{ date: string, total: number, completed: number, skipped: number, avgWaitingSeconds: number | null }>
  hourly: Array<{ hour: number, count: number }>
  byQueueType: Array<{ id: string, code: string, name: string, color: string, total: number, completed: number, skipped: number, avgWaitingSeconds: number | null, avgServiceSeconds: number | null }>
  operators: Array<{ id: string, name: string, served: number, skipped: number, recalls: number, avgServiceSeconds: number | null }>
  satisfaction: Array<{ rating: number, count: number }>
}

const { current, currentId, loadEvents } = useCurrentEvent()
// Warna layanan dipilih admin; disesuaikan agar tetap terbaca di tema gelap.
const { readable } = useReadableColor()
await loadEvents()

// tanggal mengikuti zona waktu event, bukan UTC maupun zona peramban
const today = computed(() => todayInTimezone(current.value?.timezone))

const from = ref(addDays(today.value, -29))
const to = ref(today.value)

// ganti event bisa berarti ganti zona waktu — segarkan rentang bawaannya
watch(() => current.value?.timezone, () => {
  to.value = today.value
  from.value = addDays(today.value, -29)
})
const queueTypeId = ref(SELECT_ALL)
const queueTypes = ref<Array<{ id: string, code: string, name: string }>>([])
const data = ref<Analytics | null>(null)
const pending = ref(false)

const PRESETS = [
  { label: '7 hari', days: 7 },
  { label: '30 hari', days: 30 },
  { label: '90 hari', days: 90 },
]

function applyPreset(days: number) {
  to.value = today.value
  from.value = addDays(today.value, -(days - 1))
}

async function load() {
  if (!currentId.value) { data.value = null; return }
  pending.value = true
  try {
    data.value = await apiFetch<Analytics>('/api/admin/analytics', {
      query: {
        eventId: currentId.value,
        from: from.value,
        to: to.value,
        ...(filterValue(queueTypeId.value) ? { queueTypeId: queueTypeId.value } : {}),
      },
    })
  }
  finally { pending.value = false }
}

async function loadTypes() {
  if (!currentId.value) return
  queueTypes.value = await apiFetch('/api/admin/queue-types', { query: { eventId: currentId.value } })
}

watch(currentId, async () => { await Promise.all([loadTypes(), load()]) }, { immediate: true })
watch([from, to, queueTypeId], load)

// ---- util ----
function minutes(seconds: number | null) {
  if (seconds === null || seconds === undefined) return '–'
  const m = Math.round(seconds / 60)
  return m < 1 ? '<1m' : `${m}m`
}

const AXIS = {
  axisLine: { lineStyle: { color: '#94a3b8' } },
  axisLabel: { color: '#94a3b8', fontSize: 11 },
  splitLine: { lineStyle: { color: 'rgba(148,163,184,0.15)' } },
}

const trendOption = computed<EChartsOption>(() => ({
  tooltip: { trigger: 'axis' },
  legend: { data: ['Total', 'Selesai', 'Dilewati'], textStyle: { color: '#94a3b8' }, top: 0 },
  grid: { left: 45, right: 16, top: 34, bottom: 28 },
  xAxis: {
    type: 'category',
    data: data.value?.daily.map(d => d.date.slice(5)) ?? [],
    ...AXIS,
  },
  yAxis: { type: 'value', ...AXIS },
  series: [
    {
      name: 'Total',
      type: 'line',
      smooth: true,
      showSymbol: false,
      data: data.value?.daily.map(d => d.total) ?? [],
      itemStyle: { color: '#1b5cf5' },
      areaStyle: { color: 'rgba(27,92,245,0.15)' },
    },
    {
      name: 'Selesai',
      type: 'line',
      smooth: true,
      showSymbol: false,
      data: data.value?.daily.map(d => d.completed) ?? [],
      itemStyle: { color: '#10b981' },
    },
    {
      name: 'Dilewati',
      type: 'line',
      smooth: true,
      showSymbol: false,
      data: data.value?.daily.map(d => d.skipped) ?? [],
      itemStyle: { color: '#f97316' },
    },
  ],
}))

const hourlyOption = computed<EChartsOption>(() => ({
  tooltip: { trigger: 'axis' },
  grid: { left: 40, right: 16, top: 16, bottom: 28 },
  xAxis: {
    type: 'category',
    data: Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0')),
    ...AXIS,
  },
  yAxis: { type: 'value', ...AXIS },
  series: [{
    type: 'bar',
    data: Array.from({ length: 24 }, (_, h) => data.value?.hourly.find(x => x.hour === h)?.count ?? 0),
    itemStyle: { color: '#1b5cf5', borderRadius: [4, 4, 0, 0] },
  }],
}))

const byTypeOption = computed<EChartsOption>(() => ({
  tooltip: { trigger: 'item' },
  legend: { bottom: 0, textStyle: { color: '#94a3b8' } },
  series: [{
    type: 'pie',
    radius: ['45%', '70%'],
    avoidLabelOverlap: true,
    itemStyle: { borderRadius: 6, borderColor: 'transparent', borderWidth: 2 },
    label: { show: false },
    data: (data.value?.byQueueType ?? [])
      .filter(t => t.total > 0)
      .map(t => ({ name: `${t.code} · ${t.name}`, value: t.total, itemStyle: { color: t.color } })),
  }],
}))

const waitingOption = computed<EChartsOption>(() => ({
  tooltip: {
    trigger: 'axis',
    valueFormatter: (v: unknown) => `${Math.round(Number(v) / 60)} menit`,
  },
  grid: { left: 45, right: 16, top: 16, bottom: 28 },
  xAxis: { type: 'category', data: data.value?.daily.map(d => d.date.slice(5)) ?? [], ...AXIS },
  yAxis: {
    type: 'value',
    ...AXIS,
    axisLabel: { ...AXIS.axisLabel, formatter: (v: number) => `${Math.round(v / 60)}m` },
  },
  series: [{
    type: 'line',
    smooth: true,
    showSymbol: false,
    connectNulls: true,
    data: data.value?.daily.map(d => d.avgWaitingSeconds) ?? [],
    itemStyle: { color: '#f59e0b' },
    areaStyle: { color: 'rgba(245,158,11,0.15)' },
  }],
}))

const operatorOption = computed<EChartsOption>(() => ({
  tooltip: { trigger: 'axis' },
  legend: { data: ['Dilayani', 'Dilewati'], textStyle: { color: '#94a3b8' }, top: 0 },
  grid: { left: 110, right: 16, top: 34, bottom: 28 },
  xAxis: { type: 'value', ...AXIS },
  yAxis: {
    type: 'category',
    data: (data.value?.operators ?? []).map(o => o.name).reverse(),
    ...AXIS,
  },
  series: [
    {
      name: 'Dilayani',
      type: 'bar',
      stack: 'total',
      data: (data.value?.operators ?? []).map(o => o.served).reverse(),
      itemStyle: { color: '#10b981' },
    },
    {
      name: 'Dilewati',
      type: 'bar',
      stack: 'total',
      data: (data.value?.operators ?? []).map(o => o.skipped).reverse(),
      itemStyle: { color: '#f97316' },
    },
  ],
}))

const satisfactionOption = computed<EChartsOption>(() => ({
  tooltip: { trigger: 'axis' },
  grid: { left: 40, right: 16, top: 16, bottom: 28 },
  xAxis: {
    type: 'category',
    data: (data.value?.satisfaction ?? []).map(s => `${s.rating}★`),
    ...AXIS,
  },
  yAxis: { type: 'value', ...AXIS },
  series: [{
    type: 'bar',
    data: (data.value?.satisfaction ?? []).map(s => s.count),
    itemStyle: { color: '#7c3aed', borderRadius: [4, 4, 0, 0] },
  }],
}))

function isPreset(days: number) {
  return from.value === addDays(today.value, -(days - 1)) && to.value === today.value
}

const hasQueues = computed(() => (data.value?.totals.queues ?? 0) > 0)
const hasRatings = computed(() => (data.value?.averages.ratingCount ?? 0) > 0)
const hasOperators = computed(() => (data.value?.operators.length ?? 0) > 0)

const cards = computed(() => {
  const t = data.value?.totals
  const a = data.value?.averages
  return [
    { label: 'Total Antrean', value: (t?.queues ?? 0).toLocaleString('id-ID'), icon: 'i-lucide-list-ordered' },
    { label: 'Pengunjung Unik', value: (t?.visitors ?? 0).toLocaleString('id-ID'), icon: 'i-lucide-users' },
    { label: 'Selesai', value: (t?.completed ?? 0).toLocaleString('id-ID'), icon: 'i-lucide-check-check' },
    { label: 'Rata-rata Tunggu', value: minutes(a?.waitingSeconds ?? null), icon: 'i-lucide-hourglass' },
    { label: 'Rata-rata Layanan', value: minutes(a?.serviceSeconds ?? null), icon: 'i-lucide-timer' },
    {
      label: 'Kepuasan',
      value: a?.satisfaction ? `${a.satisfaction} / 5` : '–',
      icon: 'i-lucide-star',
      hint: a?.ratingCount ? `${a.ratingCount} penilaian` : 'belum ada penilaian',
    },
  ]
})
</script>

<template>
  <div>
    <UiPageHeading
      title="Analytics"
      icon="i-lucide-chart-line"
      :description="data ? `${data.range.from} sampai ${data.range.to} · ${data.range.days} hari` : 'Tren volume antrean, waktu tunggu, dan performa operator.'"
    >
      <template #actions>
        <UiEventPicker />
        <UButton icon="i-lucide-refresh-cw" aria-label="Muat ulang data" title="Muat ulang data" variant="outline" color="neutral" :loading="pending" @click="load" />
      </template>
    </UiPageHeading>

    <!-- Filter -->
    <div class="mb-4 flex flex-wrap items-center gap-2">
      <UButton
        v-for="preset in PRESETS"
        :key="preset.days"
        size="sm"
        :variant="isPreset(preset.days) ? 'solid' : 'outline'"
        :color="isPreset(preset.days) ? 'primary' : 'neutral'"
        :label="preset.label"
        @click="applyPreset(preset.days)"
      />
      <UInput v-model="from" type="date" size="sm" class="w-40" aria-label="Tanggal mulai" title="Tanggal mulai" />
      <span class="text-slate-400">—</span>
      <UInput v-model="to" type="date" size="sm" class="w-40" aria-label="Tanggal akhir" title="Tanggal akhir" />
      <USelect
        v-model="queueTypeId"
        :items="[{ label: 'Semua layanan', value: SELECT_ALL }, ...queueTypes.map(t => ({ label: `${t.code} · ${t.name}`, value: t.id }))]"
        size="sm"
        class="w-52"
      />
      <UButton
        class="ml-auto"
        size="sm"
        variant="outline"
        color="neutral"
        icon="i-lucide-file-bar-chart"
        label="Laporan & Ekspor"
        to="/admin/reports"
      />
    </div>

    <UAlert
      v-if="!currentId"
      color="warning"
      variant="soft"
      icon="i-lucide-info"
      title="Belum ada event"
      description="Pilih atau buat event terlebih dahulu."
    />

    <template v-else>
      <!-- Kartu ringkas -->
      <div class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <div
          v-for="card in cards"
          :key="card.label"
          class="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
        >
          <UIcon :name="card.icon" class="size-4 text-slate-400" />
          <USkeleton v-if="pending && !data" class="mt-2 h-7 w-16" />
          <p v-else class="mt-2 text-xl font-bold tabular-nums">
            {{ card.value }}
          </p>
          <p class="text-xs text-slate-500">
            {{ card.label }}
          </p>
          <p v-if="card.hint" class="text-[11px] text-slate-400">
            {{ card.hint }}
          </p>
        </div>
      </div>

      <div
        v-if="!hasQueues && !pending"
        class="mt-4 rounded-xl border border-dashed border-slate-300 py-16 text-center dark:border-slate-700"
      >
        <UIcon name="i-lucide-chart-line" class="mx-auto size-10 text-slate-400" />
        <p class="mt-3 font-medium">
          Belum ada antrean pada rentang ini
        </p>
        <p class="mt-1 text-sm text-slate-500">
          Coba perlebar rentang tanggal atau pilih layanan lain.
        </p>
      </div>

      <template v-else>
        <!-- Tren harian -->
        <div class="mt-4 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <h2 class="mb-2 font-semibold">
            Tren Harian
          </h2>
          <ChartsBaseChart :option="trendOption" :height="300" />
        </div>

        <div class="mt-4 grid gap-4 lg:grid-cols-3">
          <div class="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 lg:col-span-2">
            <h2 class="mb-2 font-semibold">
              Volume per Jam
            </h2>
            <p class="mb-2 text-xs text-slate-500">
              Zona waktu {{ data?.event.timezone }}
            </p>
            <ChartsBaseChart :option="hourlyOption" :height="260" />
          </div>

          <div class="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <h2 class="mb-2 font-semibold">
              Komposisi Layanan
            </h2>
            <ChartsBaseChart :option="byTypeOption" :height="260" />
          </div>
        </div>

        <div class="mt-4 grid gap-4 lg:grid-cols-2">
          <div class="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <h2 class="mb-2 font-semibold">
              Rata-rata Waktu Tunggu
            </h2>
            <ChartsBaseChart :option="waitingOption" :height="260" />
          </div>

          <div class="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <h2 class="mb-2 font-semibold">
              Performa Operator
            </h2>
            <div v-if="!hasOperators" class="py-16 text-center text-sm text-slate-500">
              Belum ada antrean yang ditangani operator pada rentang ini.
            </div>
            <ChartsBaseChart v-else :option="operatorOption" :height="260" />
          </div>
        </div>

        <div class="mt-4 grid gap-4 lg:grid-cols-3">
          <!-- Tabel per layanan -->
          <div class="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 lg:col-span-2">
            <h2 class="p-5 pb-3 font-semibold">
              Rincian per Layanan
            </h2>
            <table class="w-full text-sm">
              <thead class="border-y border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-800/50">
                <tr>
                  <th class="px-5 py-2 font-medium">
                    Layanan
                  </th>
                  <th class="px-3 py-2 font-medium">
                    Total
                  </th>
                  <th class="px-3 py-2 font-medium">
                    Selesai
                  </th>
                  <th class="px-3 py-2 font-medium">
                    Dilewati
                  </th>
                  <th class="px-3 py-2 font-medium">
                    Tunggu
                  </th>
                  <th class="px-3 py-2 font-medium">
                    Layanan
                  </th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
                <tr v-for="row in data?.byQueueType ?? []" :key="row.id">
                  <td class="px-5 py-2">
                    <span class="rounded px-1.5 py-0.5 text-xs font-medium" :style="{ backgroundColor: row.color + '1a', color: readable(row.color) }">
                      {{ row.code }}
                    </span>
                    <span class="ml-2">{{ row.name }}</span>
                  </td>
                  <td class="px-3 py-2 tabular-nums">
                    {{ row.total }}
                  </td>
                  <td class="px-3 py-2 tabular-nums text-emerald-600">
                    {{ row.completed }}
                  </td>
                  <td class="px-3 py-2 tabular-nums text-orange-600">
                    {{ row.skipped }}
                  </td>
                  <td class="px-3 py-2 text-slate-500">
                    {{ minutes(row.avgWaitingSeconds) }}
                  </td>
                  <td class="px-3 py-2 text-slate-500">
                    {{ minutes(row.avgServiceSeconds) }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Kepuasan -->
          <div class="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <h2 class="mb-2 font-semibold">
              Sebaran Kepuasan
            </h2>
            <div v-if="!hasRatings" class="py-16 text-center text-sm text-slate-500">
              Belum ada penilaian. Fitur rating aktif pada Phase 7.
            </div>
            <ChartsBaseChart v-else :option="satisfactionOption" :height="260" />
          </div>
        </div>
      </template>
    </template>
  </div>
</template>
