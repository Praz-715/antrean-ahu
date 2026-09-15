<script setup lang="ts">
import { apiFetch } from '../../composables/useApi'
import { PERMISSIONS } from '#shared/constants/permissions'

definePageMeta({ layout: 'admin', middleware: 'admin' })
useHead({ title: 'Penempatan Operator' })

interface QueueTypeRef {
  id: string
  code: string
  name: string
  color: string
}

/** Satu operator duduk di satu loket; layanannya diturunkan dari loket itu (§28). */
interface Placement {
  id: string
  user: { id: string, name: string, email: string, isActive: boolean }
  counter: { id: string, code: string, name: string, isActive: boolean }
  event: { id: string, name: string }
  services: QueueTypeRef[]
}

interface Candidate {
  id: string
  name: string
  email: string
  isActive: boolean
  seatedAt: { counter: { id: string, code: string, name: string }, event: { id: string, name: string } } | null
  seatedHere: boolean
  assignedEvent: { id: string, name: string } | null
}

interface CounterRow {
  id: string
  code: string
  name: string
  isActive: boolean
  services: QueueTypeRef[]
  operators: Array<{ id: string, name: string }>
}

const { can } = useMe()
// Warna layanan dipilih admin; disesuaikan agar tetap terbaca di tema gelap.
const { readable } = useReadableColor()
const { call } = useApi()
const { currentId, loadEvents } = useCurrentEvent()
await loadEvents()

const placements = ref<Placement[]>([])
const candidates = ref<Candidate[]>([])
const counters = ref<CounterRow[]>([])
const pending = ref(false)

async function load() {
  if (!currentId.value) { placements.value = []; counters.value = []; candidates.value = []; return }
  pending.value = true
  try {
    const [list, candidateList, counterList] = await Promise.all([
      apiFetch<Placement[]>('/api/admin/assignments', { query: { eventId: currentId.value } }),
      apiFetch<Candidate[]>('/api/admin/assignments/candidates', { query: { eventId: currentId.value } }),
      apiFetch<CounterRow[]>('/api/admin/counters', { query: { eventId: currentId.value } }),
    ])
    placements.value = list
    candidates.value = candidateList
    counters.value = counterList
  }
  finally { pending.value = false }
}
watch(currentId, load, { immediate: true })

// ---- tempatkan operator ----
const modalOpen = ref(false)
const saving = ref(false)
const form = reactive({ userId: '', counterId: '' })
/** Persetujuan eksplisit untuk memindahkan operator dari loket lamanya. */
const confirmMove = ref(false)

function openCreate() {
  Object.assign(form, { userId: '', counterId: servedCounters.value[0]?.id ?? '' })
  confirmMove.value = false
  modalOpen.value = true
}

/** Loket yang sudah punya layanan — hanya itu yang bisa ditempati operator. */
const servedCounters = computed(() => counters.value.filter(c => c.services.length > 0))
const emptyCounters = computed(() => counters.value.filter(c => c.services.length === 0))

const selectedCandidate = computed(() => candidates.value.find(c => c.id === form.userId) ?? null)
const selectedCounter = computed(() => counters.value.find(c => c.id === form.counterId) ?? null)

/** Operator terpilih sedang duduk di loket lain? */
const seatedElsewhere = computed(() => {
  const seat = selectedCandidate.value?.seatedAt
  if (!seat) return null
  return seat.counter.id === form.counterId ? null : seat
})

watch(() => form.userId, () => { confirmMove.value = false })

const moveWarning = computed(() => {
  const seat = seatedElsewhere.value
  if (!seat) return ''
  const sameEvent = seat.event.id === currentId.value
  return sameEvent
    ? `Operator ini sudah duduk di ${seat.counter.name}. Melanjutkan berarti memindahkannya.`
    : `Operator ini duduk di ${seat.counter.name} pada event ${seat.event.name}. Satu operator hanya melayani satu event, jadi penempatan lamanya akan dilepas.`
})

const moveCheckboxLabel = computed(() =>
  seatedElsewhere.value ? `Pindahkan dari ${seatedElsewhere.value.counter.name} ke loket ini` : '')

async function save() {
  saving.value = true
  const res = await call(
    '/api/admin/assignments',
    {
      method: 'POST',
      body: {
        userId: form.userId,
        counterId: form.counterId,
        moveFromOtherCounter: confirmMove.value,
      },
    },
  )
  saving.value = false
  if (res) { modalOpen.value = false; await load() }
}

const deleteTarget = ref<Placement | null>(null)
async function confirmDelete() {
  if (!deleteTarget.value) return
  const res = await call(`/api/admin/assignments/${deleteTarget.value.id}`, { method: 'DELETE' }, 'Penempatan dicabut')
  if (res) { deleteTarget.value = null; await load() }
}

const userOptions = computed(() =>
  candidates.value.map(c => ({
    label: c.seatedAt
      ? `${c.name} — ${c.email} · di ${c.seatedAt.counter.name}${c.seatedHere ? '' : ` (${c.seatedAt.event.name})`}`
      : `${c.name} — ${c.email}`,
    value: c.id,
  })))

const counterOptions = computed(() =>
  servedCounters.value.map(c => ({
    label: `${c.name} — melayani ${c.services.map(s => s.code).join(', ')}`,
    value: c.id,
  })))

/** Dikelompokkan per loket: itulah satuan kerja yang sebenarnya. */
const grouped = computed(() =>
  counters.value.map(counter => ({
    counter,
    rows: placements.value.filter(p => p.counter.id === counter.id),
  })))
</script>

<template>
  <div>
    <UiPageHeading
      title="Penempatan Operator"
      icon="i-lucide-link"
      description="Operator duduk di satu loket, dan loket itulah yang menentukan layanan apa saja yang ia tangani. Atur layanan loket di halaman Loket."
    >
      <template #actions>
        <UiEventPicker />
        <UButton
          v-if="can(PERMISSIONS.ASSIGNMENT_MANAGE)"
          icon="i-lucide-plus"
          label="Tempatkan Operator"
          :disabled="!currentId || !servedCounters.length"
          @click="openCreate"
        />
      </template>
    </UiPageHeading>

    <UAlert
      v-if="currentId && !counters.length"
      class="mb-4"
      color="warning"
      variant="soft"
      icon="i-lucide-door-closed"
      title="Event ini belum punya loket"
      description="Buat loket lebih dulu di halaman Loket, tentukan layanan yang dilayaninya, baru tempatkan operator."
    />

    <UAlert
      v-else-if="emptyCounters.length"
      class="mb-4"
      color="warning"
      variant="soft"
      icon="i-lucide-list-x"
      :title="`${emptyCounters.length} loket belum punya layanan`"
      :description="`${emptyCounters.map(c => c.name).join(', ')} belum melayani jenis antrean apa pun, jadi belum bisa ditempati operator. Atur layanannya di halaman Loket.`"
    />

    <div v-if="pending && !placements.length" class="space-y-3">
      <USkeleton v-for="i in 3" :key="i" class="h-24 w-full" />
    </div>

    <div v-else class="space-y-4">
      <section
        v-for="group in grouped"
        :key="group.counter.id"
        class="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
        :class="{ 'opacity-60': !group.counter.isActive }"
      >
        <div class="mb-3 flex flex-wrap items-center gap-3">
          <div class="flex size-10 items-center justify-center rounded-lg bg-slate-100 font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
            {{ group.counter.code }}
          </div>
          <div class="min-w-40 flex-1">
            <p class="font-semibold">
              {{ group.counter.name }}
            </p>
            <div class="mt-1 flex flex-wrap gap-1">
              <span
                v-for="service in group.counter.services"
                :key="service.id"
                class="rounded px-1.5 py-0.5 text-xs font-medium"
                :style="{ backgroundColor: service.color + '1a', color: readable(service.color) }"
              >{{ service.code }} · {{ service.name }}</span>
              <NuxtLink
                v-if="!group.counter.services.length"
                to="/admin/counters"
                class="text-xs font-medium text-amber-600 underline dark:text-amber-400"
              >
                belum ada layanan — atur di halaman Loket
              </NuxtLink>
            </div>
          </div>
          <UBadge
            size="sm"
            variant="subtle"
            :color="group.rows.length ? 'success' : 'neutral'"
            :label="`${group.rows.length} operator`"
          />
        </div>

        <div v-if="!group.rows.length" class="rounded-lg border border-dashed border-slate-300 py-6 text-center text-sm text-slate-500 dark:border-slate-700">
          Belum ada operator di loket ini.
        </div>

        <ul v-else class="divide-y divide-slate-100 dark:divide-slate-800">
          <li v-for="row in group.rows" :key="row.id" class="flex flex-wrap items-center gap-3 py-2">
            <UIcon name="i-lucide-user-round" class="size-4 text-slate-400" />
            <span class="font-medium">{{ row.user.name }}</span>
            <span class="text-sm text-slate-500">{{ row.user.email }}</span>
            <UBadge v-if="!row.user.isActive" size="sm" color="neutral" variant="subtle" label="Nonaktif" />
            <UButton
              v-if="can(PERMISSIONS.ASSIGNMENT_MANAGE)"
              class="ml-auto"
              icon="i-lucide-user-round-x"
              aria-label="Cabut penempatan"
              title="Cabut penempatan"
              variant="ghost"
              color="error"
              size="xs"
              @click="deleteTarget = row"
            />
          </li>
        </ul>
      </section>
    </div>

    <UModal
      v-model:open="modalOpen"
      title="Tempatkan Operator"
      description="Pilih operator dan loket tempat ia duduk. Layanan yang ia tangani mengikuti loket."
    >
      <template #body>
        <div class="space-y-4">
          <UAlert
            v-if="seatedElsewhere"
            color="warning"
            variant="soft"
            icon="i-lucide-user-round-x"
            title="Operator ini sudah punya loket"
            :description="moveWarning"
          />

          <UCheckbox
            v-if="seatedElsewhere"
            v-model="confirmMove"
            :label="moveCheckboxLabel"
          />

          <UFormField label="Operator" required>
            <USelectMenu
              v-model="form.userId"
              :items="userOptions"
              value-key="value"
              :search-input="{ placeholder: 'Cari nama…' }"
              placeholder="Pilih pengguna"
              class="w-full"
            />
          </UFormField>

          <UFormField label="Loket" required help="Hanya loket yang sudah punya layanan bisa ditempati.">
            <USelect v-model="form.counterId" :items="counterOptions" value-key="value" class="w-full" />
          </UFormField>

          <div v-if="selectedCounter" class="rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-800/50">
            <p class="text-xs uppercase tracking-wide text-slate-500">
              Layanan yang akan ia tangani
            </p>
            <div class="mt-1 flex flex-wrap gap-1">
              <span
                v-for="service in selectedCounter.services"
                :key="service.id"
                class="rounded px-1.5 py-0.5 text-xs font-medium"
                :style="{ backgroundColor: service.color + '1a', color: readable(service.color) }"
              >{{ service.code }} · {{ service.name }}</span>
            </div>
          </div>
        </div>
      </template>

      <template #footer="{ close }">
        <div class="flex w-full justify-end gap-2">
          <UButton variant="ghost" color="neutral" label="Batal" @click="close" />
          <UButton
            :loading="saving"
            :disabled="!form.userId || !form.counterId || (!!seatedElsewhere && !confirmMove)"
            icon="i-lucide-save"
            :label="seatedElsewhere ? 'Pindahkan & Simpan' : 'Tempatkan'"
            @click="save"
          />
        </div>
      </template>
    </UModal>

    <UModal
      :open="!!deleteTarget"
      title="Cabut penempatan operator?"
      description="Ia tidak lagi bisa membuka papan kerja loket itu. Antrean yang sudah dilayaninya tetap tercatat."
      @update:open="(v) => { if (!v) deleteTarget = null }"
    >
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton variant="ghost" color="neutral" label="Batal" @click="deleteTarget = null" />
          <UiActionButton color="error" icon="i-lucide-user-round-x" label="Cabut" :action="confirmDelete" />
        </div>
      </template>
    </UModal>
  </div>
</template>
