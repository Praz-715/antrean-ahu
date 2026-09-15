<script setup lang="ts">
import { apiFetch } from '../../composables/useApi'
import { PERMISSIONS } from '#shared/constants/permissions'

definePageMeta({ layout: 'admin', middleware: 'admin' })
useHead({ title: 'Loket' })

interface QueueTypeRef {
  id: string
  code: string
  name: string
  color: string
  isActive?: boolean
}

interface Counter {
  id: string
  code: string
  name: string
  isActive: boolean
  displayOrder: number
  /** Layanan yang dilayani loket ini — dari sinilah cakupan operatornya (§12, §28). */
  services: QueueTypeRef[]
  operators: Array<{ id: string, name: string }>
  _count?: { assignments: number }
}

const { can } = useMe()
const { call } = useApi()
// Warna layanan dipilih admin; disesuaikan agar tetap terbaca di tema gelap.
const { readable } = useReadableColor()
const { currentId, loadEvents } = useCurrentEvent()
await loadEvents()

const items = ref<Counter[]>([])
const queueTypes = ref<QueueTypeRef[]>([])
const pending = ref(false)

async function load() {
  if (!currentId.value) { items.value = []; queueTypes.value = []; return }
  pending.value = true
  try {
    const [counters, types] = await Promise.all([
      apiFetch<Counter[]>('/api/admin/counters', { query: { eventId: currentId.value } }),
      apiFetch<QueueTypeRef[]>('/api/admin/queue-types', { query: { eventId: currentId.value } }),
    ])
    items.value = counters
    queueTypes.value = types
  }
  finally { pending.value = false }
}
watch(currentId, load, { immediate: true })

const modalOpen = ref(false)
const editing = ref<Counter | null>(null)
const saving = ref(false)
const form = reactive({ code: '', name: '', isActive: true, displayOrder: 1 })

function openCreate() {
  editing.value = null
  Object.assign(form, {
    code: `L${items.value.length + 1}`,
    name: `Loket ${items.value.length + 1}`,
    isActive: true,
    displayOrder: items.value.length + 1,
  })
  modalOpen.value = true
}

function openEdit(item: Counter) {
  editing.value = item
  Object.assign(form, { code: item.code, name: item.name, isActive: item.isActive, displayOrder: item.displayOrder })
  modalOpen.value = true
}

async function save() {
  saving.value = true
  const body = { code: form.code, name: form.name, isActive: form.isActive, displayOrder: Number(form.displayOrder) }
  const res = editing.value
    ? await call(`/api/admin/counters/${editing.value.id}`, { method: 'PATCH', body }, 'Loket diperbarui')
    : await call('/api/admin/counters', { method: 'POST', body: { ...body, eventId: currentId.value } }, 'Loket dibuat')
  saving.value = false
  if (res) { modalOpen.value = false; await load() }
}

/**
 * Pengatur layanan loket.
 *
 * Layanan melekat pada LOKET, bukan pada operator: mengubahnya di sini langsung
 * berlaku bagi semua operator yang duduk di loket itu — tidak perlu menyentuh
 * penugasan satu per satu.
 */
const servicesTarget = ref<Counter | null>(null)
const selectedServices = ref<string[]>([])
const savingServices = ref(false)

function openServices(item: Counter) {
  servicesTarget.value = item
  selectedServices.value = item.services.map(s => s.id)
}

function toggleService(id: string) {
  selectedServices.value = selectedServices.value.includes(id)
    ? selectedServices.value.filter(x => x !== id)
    : [...selectedServices.value, id]
}

async function saveServices() {
  if (!servicesTarget.value) return
  savingServices.value = true
  const res = await call(
    `/api/admin/counters/${servicesTarget.value.id}/services`,
    { method: 'PUT', body: { queueTypeIds: selectedServices.value } },
    'Layanan loket disimpan',
  )
  savingServices.value = false
  if (res) { servicesTarget.value = null; await load() }
}

const deleteTarget = ref<Counter | null>(null)
const deleting = ref(false)
async function confirmDelete() {
  if (!deleteTarget.value) return
  deleting.value = true
  const res = await call(`/api/admin/counters/${deleteTarget.value.id}`, { method: 'DELETE' }, 'Loket dihapus')
  deleting.value = false
  if (res) { deleteTarget.value = null; await load() }
}
</script>

<template>
  <div>
    <UiPageHeading
      title="Loket"
      icon="i-lucide-door-open"
      description="Titik layanan fisik tempat pengunjung dipanggil — muncul pada pengumuman display dan tiket antrean."
    >
      <template #actions>
        <UiEventPicker />
        <UButton
          v-if="can(PERMISSIONS.COUNTER_MANAGE)"
          icon="i-lucide-plus"
          label="Tambah Loket"
          :disabled="!currentId"
          @click="openCreate"
        />
      </template>
    </UiPageHeading>

    <div v-if="pending && !items.length" class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <USkeleton v-for="i in 4" :key="i" class="h-28" />
    </div>

    <div
      v-else-if="!items.length"
      class="rounded-xl border border-dashed border-slate-300 py-16 text-center dark:border-slate-700"
    >
      <UIcon name="i-lucide-door-open" class="mx-auto size-10 text-slate-400" />
      <p class="mt-3 font-medium">
        Belum ada loket
      </p>
      <p class="mx-auto mt-1 max-w-md text-sm text-slate-500">
        Tambahkan Loket 1, Loket 2, dan seterusnya, lalu tugaskan operator ke masing-masing loket.
      </p>
      <UButton
        v-if="can(PERMISSIONS.COUNTER_MANAGE)"
        class="mt-4"
        icon="i-lucide-plus"
        label="Tambah Loket"
        :disabled="!currentId"
        @click="openCreate"
      />
    </div>

    <div v-else class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <div
        v-for="item in items"
        :key="item.id"
        class="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
        :class="{ 'opacity-60': !item.isActive }"
      >
        <div class="flex items-start justify-between">
          <div class="flex size-10 items-center justify-center rounded-lg bg-slate-100 font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
            {{ item.code }}
          </div>
          <UDropdownMenu
            v-if="can(PERMISSIONS.COUNTER_MANAGE)"
            :items="[
              [{ label: 'Ubah', icon: 'i-lucide-pencil', onSelect: () => openEdit(item) }],
              [{ label: 'Hapus', icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: () => (deleteTarget = item) }],
            ]"
          >
            <UButton icon="i-lucide-ellipsis-vertical" aria-label="Menu tindakan" title="Menu tindakan" variant="ghost" color="neutral" size="xs" />
          </UDropdownMenu>
        </div>

        <p class="mt-3 font-semibold">
          {{ item.name }}
        </p>

        <div class="mt-2 flex flex-wrap gap-1">
          <span
            v-for="service in item.services"
            :key="service.id"
            class="rounded px-1.5 py-0.5 text-xs font-medium"
            :style="{ backgroundColor: service.color + '1a', color: readable(service.color) }"
          >{{ service.code }}</span>
          <span v-if="!item.services.length" class="text-xs text-amber-600 dark:text-amber-400">
            belum melayani layanan apa pun
          </span>
        </div>

        <p class="mt-2 text-xs text-slate-500">
          {{ item.operators.length }} operator
          <template v-if="item.operators.length">
            · {{ item.operators.map(o => o.name).join(', ') }}
          </template>
        </p>

        <div class="mt-2 flex items-center gap-2">
          <UBadge
            size="sm"
            variant="subtle"
            :color="item.isActive ? 'success' : 'neutral'"
            :label="item.isActive ? 'Aktif' : 'Nonaktif'"
          />
          <UButton
            v-if="can(PERMISSIONS.COUNTER_MANAGE)"
            size="xs"
            variant="ghost"
            color="neutral"
            icon="i-lucide-list-checks"
            label="Atur layanan"
            @click="openServices(item)"
          />
        </div>
      </div>
    </div>

    <UModal
      :open="!!servicesTarget"
      :title="`Layanan ${servicesTarget?.name ?? ''}`"
      description="Loket melayani jenis antrean yang dicentang. Operator yang duduk di loket ini otomatis menangani layanan tersebut."
      @update:open="(v) => { if (!v) servicesTarget = null }"
    >
      <template #body>
        <div v-if="!queueTypes.length" class="rounded-lg border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500 dark:border-slate-700">
          Event ini belum punya jenis antrean.
        </div>
        <div v-else class="space-y-2">
          <label
            v-for="type in queueTypes"
            :key="type.id"
            class="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/50"
          >
            <UCheckbox
              :model-value="selectedServices.includes(type.id)"
              @update:model-value="() => toggleService(type.id)"
            />
            <span
              class="rounded px-1.5 py-0.5 text-xs font-semibold"
              :style="{ backgroundColor: type.color + '1a', color: readable(type.color) }"
            >{{ type.code }}</span>
            <span class="flex-1 text-sm">{{ type.name }}</span>
            <UBadge v-if="type.isActive === false" size="sm" color="neutral" variant="subtle" label="Nonaktif" />
          </label>

          <p v-if="!selectedServices.length && (servicesTarget?.operators.length ?? 0) > 0" class="pt-2 text-sm text-amber-600 dark:text-amber-400">
            Loket ini masih diisi {{ servicesTarget?.operators.length }} operator. Mengosongkan layanannya akan ditolak — pindahkan operatornya lebih dulu.
          </p>
        </div>
      </template>

      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton variant="ghost" color="neutral" label="Batal" @click="servicesTarget = null" />
          <UButton :loading="savingServices" icon="i-lucide-save" label="Simpan Layanan" @click="saveServices" />
        </div>
      </template>
    </UModal>

    <UModal
      v-model:open="modalOpen"
      :title="editing ? 'Ubah Loket' : 'Loket Baru'"
      description="Kode dipakai internal, nama tampil di display dan pengumuman suara."
    >
      <template #body>
        <div class="space-y-4">
          <UFormField label="Kode" required>
            <UInput v-model="form.code" class="w-full" placeholder="L1" />
          </UFormField>
          <UFormField label="Nama" required>
            <UInput v-model="form.name" class="w-full" placeholder="Loket 1" />
          </UFormField>
          <UFormField label="Urutan Tampil">
            <UInputNumber v-model="form.displayOrder" :min="0" class="w-full" />
          </UFormField>
          <UCheckbox v-model="form.isActive" label="Aktif" />
        </div>
      </template>

      <template #footer="{ close }">
        <div class="flex w-full justify-end gap-2">
          <UButton variant="ghost" color="neutral" label="Batal" @click="close" />
          <UButton
            :loading="saving"
            :disabled="!form.code || form.name.trim().length < 2"
            icon="i-lucide-save"
            :label="editing ? 'Simpan' : 'Tambah'"
            @click="save"
          />
        </div>
      </template>
    </UModal>

    <UModal
      :open="!!deleteTarget"
      title="Hapus loket?"
      :description="`Loket &quot;${deleteTarget?.name}&quot; akan dihapus dan penugasan operator ke loket ini dilepas.`"
      @update:open="(v) => { if (!v) deleteTarget = null }"
    >
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton variant="ghost" color="neutral" label="Batal" @click="deleteTarget = null" />
          <UButton color="error" :loading="deleting" icon="i-lucide-trash-2" label="Hapus" @click="confirmDelete" />
        </div>
      </template>
    </UModal>
  </div>
</template>
