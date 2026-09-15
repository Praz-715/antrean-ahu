<script setup lang="ts">
import { apiFetch } from '../../composables/useApi'
import { PERMISSIONS } from '#shared/constants/permissions'
import { SELECT_ALL, filterValue } from '#shared/constants/ui'
import { todayInTimezone, addDays } from '#shared/utils/service-date'

definePageMeta({ layout: 'admin', middleware: 'admin' })
useHead({ title: 'Rating & Testimoni' })

interface Testimonial {
  id: string
  rating: number
  comment: string | null
  isApproved: boolean
  approvedAt: string | null
  createdAt: string
  approvedBy: { id: string, name: string } | null
  visitor: { fullName: string | null } | null
  queue: {
    queueNumber: string
    serviceDate: string
    queueType: { id: string, name: string, color: string }
    operator: { name: string } | null
    counter: { name: string } | null
  }
}

interface FeedbackResponse {
  items: Testimonial[]
  total: number
  page: number
  limit: number
  totalPages: number
  summary: {
    total: number
    pending: number
    average: number
    byRating: Record<string, number>
    satisfactionRate: number
  }
}

const { can } = useMe()
const { call } = useApi()
const { current, currentId, loadEvents } = useCurrentEvent()
await loadEvents()

const timezone = computed(() => current.value?.timezone ?? 'Asia/Jakarta')
const today = computed(() => todayInTimezone(timezone.value))

const status = ref<string>(SELECT_ALL)
const rating = ref<string>(SELECT_ALL)
const search = ref('')
const from = ref(addDays(today.value, -30))
const to = ref(today.value)
const page = ref(1)

const data = ref<FeedbackResponse | null>(null)
const pending = ref(false)

async function load() {
  if (!currentId.value) { data.value = null; return }
  pending.value = true
  try {
    data.value = await apiFetch<FeedbackResponse>('/api/admin/testimonials', {
      query: {
        eventId: currentId.value,
        status: status.value === SELECT_ALL ? 'all' : status.value,
        ...(filterValue(rating.value) ? { rating: Number(rating.value) } : {}),
        ...(search.value.trim() ? { search: search.value.trim() } : {}),
        from: from.value,
        to: to.value,
        page: page.value,
        limit: 25,
      },
    })
  }
  finally { pending.value = false }
}

watch(currentId, () => {
  // Rentang tanggal ikut zona waktu event yang dipilih, bukan zona waktu server.
  from.value = addDays(todayInTimezone(timezone.value), -30)
  to.value = todayInTimezone(timezone.value)
  page.value = 1
  void load()
}, { immediate: true })

watch([status, rating, from, to], () => { page.value = 1; void load() })
watch(page, load)

let searchTimer: ReturnType<typeof setTimeout> | undefined
watch(search, () => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => { page.value = 1; void load() }, 350)
})
onBeforeUnmount(() => clearTimeout(searchTimer))

const canModerate = computed(() => can(PERMISSIONS.FEEDBACK_MODERATE))

async function moderate(item: Testimonial, isApproved: boolean) {
  const res = await call(
    `/api/admin/testimonials/${item.id}`,
    { method: 'PATCH', body: { isApproved } },
    isApproved ? 'Testimoni disetujui' : 'Testimoni disembunyikan',
  )
  if (res) await load()
}

const deleteTarget = ref<Testimonial | null>(null)
async function confirmDelete() {
  if (!deleteTarget.value) return
  const res = await call(`/api/admin/testimonials/${deleteTarget.value.id}`, { method: 'DELETE' }, 'Testimoni dihapus')
  deleteTarget.value = null
  if (res) await load()
}

const exporting = ref(false)
async function exportTestimonials() {
  exporting.value = true
  await call(
    '/api/admin/exports',
    {
      method: 'POST',
      body: { type: 'TESTIMONIALS', format: 'XLSX', filters: { eventId: currentId.value, from: from.value, to: to.value } },
    },
    'Ekspor diproses — pantau di halaman Laporan',
  )
  exporting.value = false
}

const summary = computed(() => data.value?.summary)

/** Lebar batang sebaran bintang, relatif terhadap bintang terbanyak. */
function barWidth(star: number) {
  const counts = summary.value?.byRating ?? {}
  const max = Math.max(1, ...Object.values(counts).map(Number))
  return `${Math.round(((Number(counts[star]) || 0) / max) * 100)}%`
}

function timeText(value: string) {
  return new Date(value).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}
</script>

<template>
  <div>
    <UiPageHeading
      title="Rating & Testimoni"
      icon="i-lucide-star"
      description="Penilaian yang dikirim pengunjung setelah selesai dilayani. Setujui dulu sebelum sebuah testimoni boleh ditampilkan."
    >
      <template #actions>
        <UiEventPicker />
        <UButton
          v-if="can(PERMISSIONS.REPORT_EXPORT)"
          variant="outline"
          color="neutral"
          icon="i-lucide-download"
          label="Ekspor"
          :loading="exporting"
          :disabled="!currentId"
          @click="exportTestimonials"
        />
      </template>
    </UiPageHeading>

    <!-- Rekap -->
    <div v-if="summary" class="mb-4 grid gap-4 lg:grid-cols-3">
      <div class="rounded-xl border border-slate-200 bg-white p-5 text-center dark:border-slate-800 dark:bg-slate-900">
        <p class="text-sm text-slate-500">
          Rata-rata penilaian
        </p>
        <p class="mt-1 text-4xl font-bold tabular-nums">
          {{ summary.average || '—' }}
        </p>
        <PublicRatingStars class="mt-2" :model-value="Math.round(summary.average)" readonly size="sm" />
        <p class="mt-2 text-xs text-slate-400">
          dari {{ summary.total }} penilaian
        </p>
      </div>

      <div class="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <p class="mb-3 text-sm text-slate-500">
          Sebaran bintang
        </p>
        <div v-for="star in [5, 4, 3, 2, 1]" :key="star" class="mb-1.5 flex items-center gap-2 text-sm">
          <span class="w-3 tabular-nums text-slate-500">{{ star }}</span>
          <UIcon name="i-lucide-star" class="size-3.5 text-amber-400" style="fill: currentColor" />
          <div class="h-2 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <div class="h-full rounded-full bg-amber-400" :style="{ width: barWidth(star) }" />
          </div>
          <span class="w-8 text-right tabular-nums text-slate-500">{{ summary.byRating[star] ?? 0 }}</span>
        </div>
      </div>

      <div class="grid gap-4">
        <div class="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <p class="text-sm text-slate-500">
            Tingkat kepuasan
          </p>
          <p class="mt-1 text-3xl font-bold tabular-nums text-emerald-600">
            {{ summary.satisfactionRate }}%
          </p>
          <p class="text-xs text-slate-400">
            memberi 4 atau 5 bintang
          </p>
        </div>
        <div
          class="rounded-xl border p-5"
          :class="summary.pending
            ? 'border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40'
            : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900'"
        >
          <p class="text-sm text-slate-500">
            Menunggu moderasi
          </p>
          <p class="mt-1 text-3xl font-bold tabular-nums">
            {{ summary.pending }}
          </p>
        </div>
      </div>
    </div>

    <!-- Penyaring -->
    <div class="mb-4 grid gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 sm:grid-cols-2 lg:grid-cols-5">
      <UFormField label="Status" size="sm">
        <USelect
          v-model="status"
          class="w-full"
          :items="[
            { label: 'Semua status', value: SELECT_ALL },
            { label: 'Menunggu moderasi', value: 'pending' },
            { label: 'Disetujui', value: 'approved' },
          ]"
        />
      </UFormField>
      <UFormField label="Bintang" size="sm">
        <USelect
          v-model="rating"
          class="w-full"
          :items="[
            { label: 'Semua bintang', value: SELECT_ALL },
            ...[5, 4, 3, 2, 1].map(n => ({ label: `${n} bintang`, value: String(n) })),
          ]"
        />
      </UFormField>
      <UFormField label="Dari tanggal" size="sm">
        <UInput v-model="from" type="date" class="w-full" aria-label="Dari tanggal" />
      </UFormField>
      <UFormField label="Sampai tanggal" size="sm">
        <UInput v-model="to" type="date" class="w-full" aria-label="Sampai tanggal" />
      </UFormField>
      <UFormField label="Cari komentar" size="sm">
        <UInput v-model="search" class="w-full" icon="i-lucide-search" placeholder="kata kunci" />
      </UFormField>
    </div>

    <div v-if="pending && !data" class="space-y-3">
      <USkeleton v-for="i in 3" :key="i" class="h-28 w-full" />
    </div>

    <div
      v-else-if="!data?.items.length"
      class="rounded-xl border border-dashed border-slate-300 py-16 text-center dark:border-slate-700"
    >
      <UIcon name="i-lucide-star-off" class="mx-auto size-10 text-slate-400" />
      <p class="mt-3 font-medium">
        Belum ada penilaian
      </p>
      <p class="mx-auto mt-1 max-w-md text-sm text-slate-500">
        Penilaian muncul di sini setelah pengunjung mengisinya dari halaman pelacakan antrean mereka.
      </p>
    </div>

    <div v-else class="space-y-3">
      <article
        v-for="item in data.items"
        :key="item.id"
        class="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
        :class="{ 'opacity-70': !item.isApproved }"
      >
        <div class="flex flex-wrap items-start gap-4">
          <div class="min-w-56 flex-1">
            <div class="flex flex-wrap items-center gap-2">
              <PublicRatingStars :model-value="item.rating" readonly size="sm" />
              <UBadge
                size="sm"
                variant="subtle"
                :color="item.isApproved ? 'success' : 'warning'"
                :label="item.isApproved ? 'Disetujui' : 'Menunggu'"
              />
              <span
                class="rounded-full px-2 py-0.5 text-xs font-medium text-white"
                :style="{ backgroundColor: item.queue.queueType.color }"
              >{{ item.queue.queueType.name }}</span>
            </div>

            <p v-if="item.comment" class="mt-2 text-sm text-slate-700 dark:text-slate-200">
              "{{ item.comment }}"
            </p>
            <p v-else class="mt-2 text-sm italic text-slate-400">
              Tanpa komentar
            </p>

            <p class="mt-2 text-xs text-slate-400">
              {{ item.queue.queueNumber }} · {{ item.queue.serviceDate }}
              <template v-if="item.queue.counter"> · {{ item.queue.counter.name }}</template>
              <template v-if="item.queue.operator"> · dilayani {{ item.queue.operator.name }}</template>
              <template v-if="item.visitor?.fullName"> · {{ item.visitor.fullName }}</template>
              · dikirim {{ timeText(item.createdAt) }}
            </p>
          </div>

          <div v-if="canModerate" class="flex items-center gap-2">
            <UiActionButton
              v-if="!item.isApproved"
              size="xs"
              icon="i-lucide-check"
              label="Setujui"
              :action="() => moderate(item, true)"
            />
            <UiActionButton
              v-else
              size="xs"
              variant="outline"
              color="neutral"
              icon="i-lucide-eye-off"
              label="Sembunyikan"
              :action="() => moderate(item, false)"
            />
            <UButton
              size="xs"
              variant="ghost"
              color="error"
              icon="i-lucide-trash-2"
              aria-label="Hapus testimoni"
              title="Hapus testimoni"
              @click="deleteTarget = item"
            />
          </div>
        </div>
      </article>

      <div v-if="data.totalPages > 1" class="flex items-center justify-between pt-2">
        <p class="text-sm text-slate-500">
          Halaman {{ data.page }} dari {{ data.totalPages }} · {{ data.total }} penilaian
        </p>
        <UPagination
          v-model:page="page"
          :total="data.total"
          :items-per-page="data.limit"
        />
      </div>
    </div>

    <UModal
      :open="!!deleteTarget"
      title="Hapus testimoni?"
      description="Penilaian ini akan hilang permanen, termasuk dari rekap kepuasan."
      @update:open="(v) => { if (!v) deleteTarget = null }"
    >
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton variant="ghost" color="neutral" label="Batal" @click="deleteTarget = null" />
          <UiActionButton color="error" icon="i-lucide-trash-2" label="Hapus" :action="confirmDelete" />
        </div>
      </template>
    </UModal>
  </div>
</template>
