<script setup lang="ts">
import { apiFetch } from '../../composables/useApi'
import { addDays, todayInTimezone } from '#shared/utils/service-date'
import { PERMISSIONS } from '#shared/constants/permissions'

definePageMeta({ layout: 'admin', middleware: 'admin' })
useHead({ title: 'Laporan' })

interface DailyReport {
  event: { id: string, name: string, timezone: string }
  organization: { name: string } | null
  serviceDate: string
  generatedAt: string
  totals: { visitors: number, queues: number, completed: number, waiting: number, skipped: number, cancelled: number, noShow: number }
  averages: { waitingSeconds: number | null, serviceSeconds: number | null, satisfaction: number | null, ratingCount: number }
  byQueueType: Array<{ code: string, name: string, total: number, completed: number, skipped: number, avgWaitingSeconds: number | null }>
  byOperator: Array<{ name: string, served: number, skipped: number, avgServiceSeconds: number | null }>
  hourly: Array<{ hour: number, count: number }>
  busiestHour: { hour: number, count: number } | null
}

interface ExportJob {
  id: string
  type: string
  format: string
  status: 'QUEUED' | 'PROCESSING' | 'DONE' | 'FAILED'
  rowCount: number | null
  error: string | null
  createdAt: string
  filters: { from?: string, to?: string } | null
  requestedBy: { id: string, name: string } | null
  downloadUrl: string | null
}

const { can } = useMe()
const { call } = useApi()
const { current, currentId, loadEvents } = useCurrentEvent()
await loadEvents()

// tanggal mengikuti zona waktu event (§50), bukan UTC
const today = computed(() => todayInTimezone(current.value?.timezone))
const shift = addDays

// ---- laporan harian ----
const reportDate = ref(today.value)
const report = ref<DailyReport | null>(null)
const pending = ref(false)

async function loadReport() {
  if (!currentId.value) { report.value = null; return }
  pending.value = true
  try {
    report.value = await apiFetch<DailyReport>('/api/admin/reports/daily', {
      query: { eventId: currentId.value, date: reportDate.value },
    })
  }
  finally { pending.value = false }
}

watch([currentId, reportDate], loadReport, { immediate: true })

// ---- pusat ekspor ----
const jobs = ref<ExportJob[]>([])
const exportForm = reactive({
  type: 'QUEUES' as 'QUEUES' | 'VISITORS' | 'OPERATORS' | 'TESTIMONIALS',
  format: 'XLSX' as 'CSV' | 'XLSX',
  from: addDays(today.value, -29),
  to: today.value,
})

// event lain bisa berbeda zona waktu; sesuaikan tanggal bawaannya
watch(() => current.value?.timezone, () => {
  reportDate.value = today.value
  exportForm.from = addDays(today.value, -29)
  exportForm.to = today.value
})

async function loadJobs() {
  jobs.value = await apiFetch<ExportJob[]>('/api/admin/exports')
}

/**
 * Muat pertama lewat `useAsyncData`, bukan `await loadJobs()`.
 *
 * Setup berjalan dua kali — sekali di server, sekali saat hidrasi — sehingga daftar
 * yang isinya berubah cepat (pekerjaan ekspor berpindah status tiap beberapa detik)
 * bisa berbeda antara HTML kiriman server dan hasil ambilan klien. Vue melaporkannya
 * sebagai hydration mismatch lalu membuang DOM yang sudah dirender. Dengan
 * `useAsyncData`, hasil render server ikut terkirim sebagai payload dan dipakai ulang.
 */
const { data: pekerjaanAwal } = await useAsyncData('admin-export-jobs', () =>
  apiFetch<ExportJob[]>('/api/admin/exports'))
jobs.value = pekerjaanAwal.value ?? []

/** Pekerjaan diproses di latar belakang, jadi daftarnya dipantau selama masih berjalan. */
let pollTimer: ReturnType<typeof setInterval> | undefined
const hasRunning = computed(() => jobs.value.some(j => j.status === 'QUEUED' || j.status === 'PROCESSING'))

onMounted(() => {
  pollTimer = setInterval(() => { if (hasRunning.value) void loadJobs() }, 2000)
})
onBeforeUnmount(() => clearInterval(pollTimer))

async function requestExport() {
  const res = await call(
    '/api/admin/exports',
    { method: 'POST', body: { ...exportForm, eventId: currentId.value } },
    'Ekspor sedang diproses',
  )
  if (res) await loadJobs()
}

async function deleteJob(job: ExportJob) {
  const res = await call(`/api/admin/exports/${job.id}`, { method: 'DELETE' }, 'Berkas ekspor dihapus')
  if (res) await loadJobs()
}

// ---- util ----
function minutes(seconds: number | null) {
  if (seconds === null || seconds === undefined) return '–'
  const m = Math.round(seconds / 60)
  return m < 1 ? '<1m' : `${m} menit`
}

function timeLabel(value: string) {
  return new Date(value).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

const TYPE_LABEL: Record<string, string> = {
  QUEUES: 'Riwayat Antrean',
  VISITORS: 'Daftar Pengunjung',
  OPERATORS: 'Performa Operator',
  TESTIMONIALS: 'Rating & Testimoni',
}

const STATUS_META: Record<string, { label: string, color: string }> = {
  QUEUED: { label: 'Antre', color: 'neutral' },
  PROCESSING: { label: 'Diproses', color: 'info' },
  DONE: { label: 'Siap', color: 'success' },
  FAILED: { label: 'Gagal', color: 'error' },
}

const maxHourly = computed(() => Math.max(1, ...(report.value?.hourly.map(h => h.count) ?? [1])))

const summaryCards = computed(() => {
  const t = report.value?.totals
  return [
    { label: 'Pengunjung', value: t?.visitors ?? 0 },
    { label: 'Total Antrean', value: t?.queues ?? 0 },
    { label: 'Selesai', value: t?.completed ?? 0 },
    { label: 'Menunggu', value: t?.waiting ?? 0 },
    { label: 'Dilewati', value: t?.skipped ?? 0 },
    { label: 'Dibatalkan', value: t?.cancelled ?? 0 },
    { label: 'Tidak Hadir', value: t?.noShow ?? 0 },
  ]
})

/** Cetak hanya area laporan; sisa antarmuka disembunyikan lewat CSS @media print. */
function printReport() {
  window.print()
}
</script>

<template>
  <div>
    <div class="no-print">
      <UiPageHeading
        title="Laporan & Ekspor"
        icon="i-lucide-file-bar-chart"
        description="Laporan harian siap cetak, serta ekspor data ke CSV/Excel yang diproses di latar belakang."
      >
        <template #actions>
          <UiEventPicker />
          <UButton variant="outline" color="neutral" icon="i-lucide-chart-line" label="Analytics" to="/admin/analytics" />
        </template>
      </UiPageHeading>
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
      <!-- ============ LAPORAN HARIAN ============ -->
      <div class="mb-3 flex flex-wrap items-center gap-2 no-print">
        <UButton icon="i-lucide-chevron-left" aria-label="Hari sebelumnya" title="Hari sebelumnya" size="sm" variant="outline" color="neutral" @click="reportDate = shift(reportDate, -1)" />
        <UInput v-model="reportDate" type="date" size="sm" class="w-40" aria-label="Tanggal laporan" title="Tanggal laporan" />
        <UButton icon="i-lucide-chevron-right" aria-label="Hari berikutnya" title="Hari berikutnya" size="sm" variant="outline" color="neutral" :disabled="reportDate >= today" @click="reportDate = shift(reportDate, 1)" />
        <UButton size="sm" variant="ghost" color="neutral" label="Hari ini" :disabled="reportDate === today" @click="reportDate = today" />
        <UButton
          class="ml-auto"
          size="sm"
          icon="i-lucide-printer"
          variant="outline"
          color="neutral"
          label="Cetak / Simpan PDF"
          @click="printReport"
        />
      </div>

      <!-- area cetak -->
      <div id="report-area" class="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <div class="mb-5 flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-4 dark:border-slate-800">
          <div>
            <h2 class="text-lg font-bold">
              Laporan Harian Antrean
            </h2>
            <p class="text-sm text-slate-500">
              {{ report?.organization?.name ?? '' }} · {{ report?.event.name }}
            </p>
          </div>
          <div class="text-right text-sm">
            <p class="font-semibold">
              {{ report?.serviceDate }}
            </p>
            <p class="text-slate-400">
              Dibuat {{ report ? timeLabel(report.generatedAt) : '' }}
            </p>
          </div>
        </div>

        <div v-if="pending && !report" class="space-y-3">
          <USkeleton class="h-20 w-full" />
          <USkeleton class="h-40 w-full" />
        </div>

        <template v-else-if="report">
          <!-- ringkasan -->
          <div class="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
            <div
              v-for="item in summaryCards"
              :key="item.label"
              class="rounded-lg border border-slate-200 p-3 text-center dark:border-slate-800"
            >
              <p class="text-xl font-bold tabular-nums">
                {{ item.value.toLocaleString('id-ID') }}
              </p>
              <p class="text-xs text-slate-500">
                {{ item.label }}
              </p>
            </div>
          </div>

          <div class="mt-3 grid gap-3 sm:grid-cols-3">
            <div class="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
              <p class="text-xs text-slate-500">
                Rata-rata Menunggu
              </p>
              <p class="text-lg font-bold">
                {{ minutes(report.averages.waitingSeconds) }}
              </p>
            </div>
            <div class="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
              <p class="text-xs text-slate-500">
                Rata-rata Layanan
              </p>
              <p class="text-lg font-bold">
                {{ minutes(report.averages.serviceSeconds) }}
              </p>
            </div>
            <div class="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
              <p class="text-xs text-slate-500">
                Kepuasan
              </p>
              <p class="text-lg font-bold">
                {{ report.averages.satisfaction ? `${report.averages.satisfaction} / 5` : '–' }}
                <span class="text-xs font-normal text-slate-400">({{ report.averages.ratingCount }})</span>
              </p>
            </div>
          </div>

          <p v-if="report.busiestHour" class="mt-3 text-sm text-slate-500">
            Jam tersibuk: <b>{{ String(report.busiestHour.hour).padStart(2, '0') }}:00</b>
            dengan {{ report.busiestHour.count }} antrean.
          </p>

          <!-- per layanan -->
          <h3 class="mb-2 mt-5 font-semibold">
            Per Jenis Antrean
          </h3>
          <table class="w-full text-sm">
            <thead class="border-y border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800">
              <tr>
                <th class="py-2 font-medium">
                  Layanan
                </th>
                <th class="py-2 font-medium">
                  Total
                </th>
                <th class="py-2 font-medium">
                  Selesai
                </th>
                <th class="py-2 font-medium">
                  Dilewati
                </th>
                <th class="py-2 font-medium">
                  Rata-rata Tunggu
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
              <tr v-if="!report.byQueueType.length">
                <td colspan="5" class="py-4 text-center text-slate-500">
                  Belum ada jenis antrean.
                </td>
              </tr>
              <tr v-for="row in report.byQueueType" :key="row.code">
                <td class="py-2">
                  {{ row.code }} · {{ row.name }}
                </td>
                <td class="py-2 tabular-nums">
                  {{ row.total }}
                </td>
                <td class="py-2 tabular-nums">
                  {{ row.completed }}
                </td>
                <td class="py-2 tabular-nums">
                  {{ row.skipped }}
                </td>
                <td class="py-2">
                  {{ minutes(row.avgWaitingSeconds) }}
                </td>
              </tr>
            </tbody>
          </table>

          <!-- per operator -->
          <h3 class="mb-2 mt-5 font-semibold">
            Per Operator
          </h3>
          <table class="w-full text-sm">
            <thead class="border-y border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800">
              <tr>
                <th class="py-2 font-medium">
                  Operator
                </th>
                <th class="py-2 font-medium">
                  Dilayani
                </th>
                <th class="py-2 font-medium">
                  Dilewati
                </th>
                <th class="py-2 font-medium">
                  Rata-rata Layanan
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
              <tr v-if="!report.byOperator.length">
                <td colspan="4" class="py-4 text-center text-slate-500">
                  Belum ada antrean yang ditangani operator.
                </td>
              </tr>
              <tr v-for="row in report.byOperator" :key="row.name">
                <td class="py-2">
                  {{ row.name }}
                </td>
                <td class="py-2 tabular-nums">
                  {{ row.served }}
                </td>
                <td class="py-2 tabular-nums">
                  {{ row.skipped }}
                </td>
                <td class="py-2">
                  {{ minutes(row.avgServiceSeconds) }}
                </td>
              </tr>
            </tbody>
          </table>

          <!-- sebaran jam -->
          <h3 class="mb-2 mt-5 font-semibold">
            Sebaran per Jam
          </h3>
          <div v-if="!report.hourly.length" class="py-4 text-sm text-slate-500">
            Belum ada antrean pada tanggal ini.
          </div>
          <div v-else class="flex h-28 items-end gap-1">
            <div v-for="h in report.hourly" :key="h.hour" class="flex flex-1 flex-col items-center gap-1">
              <div
                class="w-full rounded-t bg-brand-500"
                :style="{ height: `${Math.max(4, (h.count / maxHourly) * 90)}px` }"
              />
              <span class="text-[10px] text-slate-400">{{ h.hour }}</span>
            </div>
          </div>
        </template>
      </div>

      <!-- ============ PUSAT EKSPOR ============ -->
      <div v-if="can(PERMISSIONS.REPORT_EXPORT)" class="mt-6 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 no-print">
        <h2 class="font-semibold">
          Pusat Ekspor
        </h2>
        <p class="mb-4 text-sm text-slate-500">
          Data besar diproses di latar belakang — halaman ini tidak akan menggantung menunggu berkasnya jadi.
        </p>

        <div class="flex flex-wrap items-end gap-2">
          <UFormField label="Data" size="xs">
            <USelect
              v-model="exportForm.type"
              :items="[
                { label: 'Riwayat Antrean', value: 'QUEUES' },
                { label: 'Daftar Pengunjung', value: 'VISITORS' },
                { label: 'Performa Operator', value: 'OPERATORS' },
                { label: 'Rating & Testimoni', value: 'TESTIMONIALS' },
              ]"
              class="w-48"
              size="sm"
            />
          </UFormField>
          <UFormField label="Format" size="xs">
            <USelect
              v-model="exportForm.format"
              :items="[{ label: 'Excel (.xlsx)', value: 'XLSX' }, { label: 'CSV', value: 'CSV' }]"
              class="w-36"
              size="sm"
            />
          </UFormField>
          <UFormField label="Dari" size="xs">
            <UInput v-model="exportForm.from" type="date" size="sm" class="w-40" aria-label="Ekspor dari tanggal" />
          </UFormField>
          <UFormField label="Sampai" size="xs">
            <UInput v-model="exportForm.to" type="date" size="sm" class="w-40" aria-label="Ekspor sampai tanggal" />
          </UFormField>
          <UiActionButton
            icon="i-lucide-download"
            label="Buat Ekspor"
            :disabled="exportForm.from > exportForm.to"
            :action="requestExport"
          />
        </div>

        <div v-if="!jobs.length" class="mt-5 rounded-lg border border-dashed border-slate-300 py-8 text-center text-sm text-slate-500 dark:border-slate-700">
          Belum ada ekspor.
        </div>

        <div v-else class="mt-5 overflow-x-auto">
          <table class="w-full text-sm">
          <thead class="border-y border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800">
            <tr>
              <th class="py-2 font-medium">
                Data
              </th>
              <th class="py-2 font-medium">
                Rentang
              </th>
              <th class="py-2 font-medium">
                Format
              </th>
              <th class="py-2 font-medium">
                Baris
              </th>
              <th class="py-2 font-medium">
                Status
              </th>
              <th class="py-2 font-medium">
                Diminta
              </th>
              <th class="w-32 py-2" />
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
            <tr v-for="job in jobs" :key="job.id">
              <td class="py-2">
                {{ TYPE_LABEL[job.type] ?? job.type }}
              </td>
              <td class="py-2 text-slate-500">
                {{ job.filters?.from }} – {{ job.filters?.to }}
              </td>
              <td class="py-2 text-slate-500">
                {{ job.format }}
              </td>
              <td class="py-2 tabular-nums text-slate-500">
                {{ job.rowCount ?? '–' }}
              </td>
              <td class="py-2">
                <UBadge
                  size="sm"
                  variant="subtle"
                  :color="(STATUS_META[job.status]?.color as never) ?? 'neutral'"
                  :label="STATUS_META[job.status]?.label ?? job.status"
                />
                <span v-if="job.error" class="ml-1 text-xs text-rose-600" :title="job.error">!</span>
              </td>
              <td class="py-2 text-xs text-slate-500">
                {{ job.requestedBy?.name }} · {{ timeLabel(job.createdAt) }}
              </td>
              <td class="py-2">
                <div class="flex justify-end gap-1">
                  <UButton
                    v-if="job.downloadUrl"
                    size="xs"
                    icon="i-lucide-download"
                    label="Unduh"
                    :to="job.downloadUrl"
                    external
                  />
                  <UiActionButton
                    size="xs"
                    variant="ghost"
                    color="error"
                    icon="i-lucide-trash-2"
                    aria-label="Hapus berkas ekspor"
                    title="Hapus berkas ekspor"
                    :action="() => deleteJob(job)"
                  />
                </div>
              </td>
            </tr>
          </tbody>
          </table>
        </div>
      </div>
    </template>
  </div>
</template>

<style>
/* Saat dicetak, sisakan area laporan saja — bukan sidebar, filter, atau pusat ekspor. */
@media print {
  .no-print,
  aside,
  header {
    display: none !important;
  }

  body,
  main {
    background: white !important;
    padding: 0 !important;
  }

  .lg\:pl-64 {
    padding-left: 0 !important;
  }

  #report-area {
    border: none !important;
    padding: 0 !important;
  }
}
</style>
