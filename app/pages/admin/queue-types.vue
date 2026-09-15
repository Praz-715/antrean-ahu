<script setup lang="ts">
import { apiFetch } from '../../composables/useApi'
import { formatQueueNumber, QUEUE_NUMBER_FORMAT_PRESETS } from '#shared/utils/queue-format'
import { todayInTimezone } from '#shared/utils/service-date'
import { PERMISSIONS } from '#shared/constants/permissions'

definePageMeta({ layout: 'admin', middleware: 'admin' })
useHead({ title: 'Jenis Antrean' })

interface QueueType {
  id: string
  code: string
  name: string
  description: string | null
  prefix: string
  startingNumber: number
  numberFormat: string
  padding: number
  color: string
  icon: string | null
  isActive: boolean
  displayOrder: number
  maxWaiting: number | null
  estServiceSeconds: number
  _count?: { queues: number, counterServices: number }
}

const { can } = useMe()
const { call } = useApi()
// Warna layanan dipilih admin; disesuaikan agar tetap terbaca di tema gelap.
const { readable } = useReadableColor()
const { current, currentId, loadEvents } = useCurrentEvent()
await loadEvents()

const items = ref<QueueType[]>([])
const pending = ref(false)

async function load() {
  if (!currentId.value) { items.value = []; return }
  pending.value = true
  try {
    items.value = await apiFetch<QueueType[]>('/api/admin/queue-types', { query: { eventId: currentId.value } })
  }
  finally {
    pending.value = false
  }
}
watch(currentId, load, { immediate: true })

// ---- form ----
const modalOpen = ref(false)
const editing = ref<QueueType | null>(null)
const saving = ref(false)

const blank = () => ({
  code: '',
  name: '',
  description: '',
  prefix: '',
  startingNumber: 1,
  numberFormat: '{prefix}{seq}',
  padding: 3,
  color: '#1b5cf5',
  icon: '',
  isActive: true,
  displayOrder: items.value.length + 1,
  maxWaiting: null as number | null,
  estServiceMinutes: 8,
})

const form = reactive(blank())

const preview = computed(() =>
  formatQueueNumber(form.numberFormat, {
    prefix: form.prefix || form.code || 'A',
    code: form.code || 'A',
    sequence: form.startingNumber || 1,
    padding: form.padding,
    serviceDate: todayInTimezone(current.value?.timezone),
  }),
)

function openCreate() {
  editing.value = null
  Object.assign(form, blank())
  modalOpen.value = true
}

function openEdit(item: QueueType) {
  editing.value = item
  Object.assign(form, {
    code: item.code,
    name: item.name,
    description: item.description ?? '',
    prefix: item.prefix,
    startingNumber: item.startingNumber,
    numberFormat: item.numberFormat,
    padding: item.padding,
    color: item.color,
    icon: item.icon ?? '',
    isActive: item.isActive,
    displayOrder: item.displayOrder,
    maxWaiting: item.maxWaiting,
    estServiceMinutes: Math.round(item.estServiceSeconds / 60),
  })
  modalOpen.value = true
}

// prefix mengikuti kode selama pengguna belum mengubahnya sendiri
watch(() => form.code, (code) => {
  if (!editing.value && (!form.prefix || form.prefix === code.slice(0, -1))) form.prefix = code
})

async function save() {
  saving.value = true
  const body = {
    code: form.code,
    name: form.name,
    description: form.description || null,
    prefix: form.prefix,
    startingNumber: Number(form.startingNumber),
    numberFormat: form.numberFormat,
    padding: Number(form.padding),
    color: form.color,
    icon: form.icon || null,
    isActive: form.isActive,
    displayOrder: Number(form.displayOrder),
    maxWaiting: form.maxWaiting ? Number(form.maxWaiting) : null,
    estServiceSeconds: Math.max(30, Number(form.estServiceMinutes) * 60),
  }

  const res = editing.value
    ? await call(`/api/admin/queue-types/${editing.value.id}`, { method: 'PATCH', body }, 'Jenis antrean diperbarui')
    : await call('/api/admin/queue-types', { method: 'POST', body: { ...body, eventId: currentId.value } }, 'Jenis antrean dibuat')

  saving.value = false
  if (res) {
    modalOpen.value = false
    await load()
  }
}

const deleteTarget = ref<QueueType | null>(null)
const deleting = ref(false)
async function confirmDelete() {
  if (!deleteTarget.value) return
  deleting.value = true
  const res = await call(`/api/admin/queue-types/${deleteTarget.value.id}`, { method: 'DELETE' }, 'Jenis antrean dihapus')
  deleting.value = false
  if (res) { deleteTarget.value = null; await load() }
}

async function toggleActive(item: QueueType) {
  await call(`/api/admin/queue-types/${item.id}`, { method: 'PATCH', body: { isActive: !item.isActive } })
  await load()
}

const PRESET_COLORS = ['#1b5cf5', '#7c3aed', '#0d9488', '#ea580c', '#dc2626', '#4f46e5', '#059669', '#0891b2']
</script>

<template>
  <div>
    <UiPageHeading
      title="Jenis Antrean"
      icon="i-lucide-tags"
      description="Layanan yang bisa dipilih pengunjung. Kode dan format nomor menentukan tampilan nomor antrean, mis. A001 atau UM-001."
    >
      <template #actions>
        <UiEventPicker />
        <UButton
          v-if="can(PERMISSIONS.QUEUE_TYPE_MANAGE)"
          icon="i-lucide-plus"
          label="Tambah Jenis Antrean"
          :disabled="!currentId"
          @click="openCreate"
        />
      </template>
    </UiPageHeading>

    <div v-if="pending && !items.length" class="space-y-3">
      <USkeleton v-for="i in 3" :key="i" class="h-20 w-full" />
    </div>

    <div
      v-else-if="!items.length"
      class="rounded-xl border border-dashed border-slate-300 py-16 text-center dark:border-slate-700"
    >
      <UIcon name="i-lucide-tags" class="mx-auto size-10 text-slate-400" />
      <p class="mt-3 font-medium">
        Belum ada jenis antrean
      </p>
      <p class="mx-auto mt-1 max-w-md text-sm text-slate-500">
        Contoh: A — Pelayanan Umum, B — Customer Service, C — Informasi. Setiap jenis punya deret nomor sendiri
        yang direset tiap hari.
      </p>
      <UButton
        v-if="can(PERMISSIONS.QUEUE_TYPE_MANAGE)"
        class="mt-4"
        icon="i-lucide-plus"
        label="Tambah Jenis Antrean"
        :disabled="!currentId"
        @click="openCreate"
      />
    </div>

    <div v-else class="space-y-3">
      <div
        v-for="item in items"
        :key="item.id"
        class="flex flex-wrap items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
        :class="{ 'opacity-60': !item.isActive }"
      >
        <div
          class="flex size-12 shrink-0 items-center justify-center rounded-xl text-lg font-extrabold"
          :style="{ backgroundColor: item.color + '1a', color: readable(item.color) }"
        >
          {{ item.code }}
        </div>

        <div class="min-w-40 flex-1">
          <div class="flex items-center gap-2">
            <p class="font-semibold">
              {{ item.name }}
            </p>
            <UBadge v-if="!item.isActive" size="sm" color="neutral" variant="subtle" label="Nonaktif" />
          </div>
          <p class="text-sm text-slate-500">
            {{ item.description || 'Tanpa deskripsi' }}
          </p>
        </div>

        <div class="text-center">
          <p class="text-xs text-slate-500">
            Contoh nomor
          </p>
          <p class="queue-number text-lg" :style="{ color: readable(item.color) }">
            {{ formatQueueNumber(item.numberFormat, { prefix: item.prefix, code: item.code, sequence: item.startingNumber, padding: item.padding }) }}
          </p>
        </div>

        <div class="text-center">
          <p class="text-xs text-slate-500">
            Total antrean
          </p>
          <p class="font-semibold">
            {{ item._count?.queues ?? 0 }}
          </p>
        </div>

        <div class="text-center">
          <p class="text-xs text-slate-500">
            Loket
          </p>
          <p class="font-semibold">
            {{ item._count?.counterServices ?? 0 }}
          </p>
        </div>

        <UDropdownMenu
          v-if="can(PERMISSIONS.QUEUE_TYPE_MANAGE)"
          :items="[
            [
              { label: 'Ubah', icon: 'i-lucide-pencil', onSelect: () => openEdit(item) },
              { label: item.isActive ? 'Nonaktifkan' : 'Aktifkan', icon: item.isActive ? 'i-lucide-eye-off' : 'i-lucide-eye', onSelect: () => toggleActive(item) },
            ],
            [{ label: 'Hapus', icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: () => (deleteTarget = item) }],
          ]"
        >
          <UButton icon="i-lucide-ellipsis-vertical" aria-label="Menu tindakan" title="Menu tindakan" variant="ghost" color="neutral" size="xs" />
        </UDropdownMenu>
      </div>
    </div>

    <!-- Modal form -->
    <UModal
      v-model:open="modalOpen"
      :title="editing ? 'Ubah Jenis Antrean' : 'Jenis Antrean Baru'"
      description="Kode dipakai sebagai identitas layanan; prefix dipakai pada nomor antrean."
      :ui="{ content: 'sm:max-w-2xl' }"
    >
      <template #body>
        <div class="grid gap-4 sm:grid-cols-2">
          <UFormField label="Kode" required help="mis. A, B, UM">
            <UInput v-model="form.code" class="w-full" placeholder="A" maxlength="20" />
          </UFormField>

          <UFormField label="Nama Layanan" required>
            <UInput v-model="form.name" class="w-full" placeholder="Pelayanan Umum" />
          </UFormField>

          <UFormField label="Deskripsi" class="sm:col-span-2">
            <UInput v-model="form.description" class="w-full" placeholder="Keterangan singkat layanan" />
          </UFormField>

          <UFormField label="Prefix Nomor" required>
            <UInput v-model="form.prefix" class="w-full" placeholder="A" maxlength="10" />
          </UFormField>

          <UFormField label="Format Nomor" help="{prefix} {code} {seq} {yyyy} {mm} {dd}">
            <USelectMenu
              v-model="form.numberFormat"
              :items="QUEUE_NUMBER_FORMAT_PRESETS.map(p => p.value)"
              create-item
              class="w-full"
            />
          </UFormField>

          <UFormField label="Mulai dari Nomor">
            <UInputNumber v-model="form.startingNumber" :min="1" class="w-full" />
          </UFormField>

          <UFormField label="Jumlah Digit">
            <UInputNumber v-model="form.padding" :min="1" :max="8" class="w-full" />
          </UFormField>

          <UFormField label="Estimasi Layanan (menit)" help="Dipakai menghitung perkiraan waktu tunggu pengunjung.">
            <UInputNumber v-model="form.estServiceMinutes" :min="1" :max="240" class="w-full" />
          </UFormField>

          <UFormField label="Batas Antrean Menunggu" help="Kosongkan bila tanpa batas.">
            <UInputNumber v-model="form.maxWaiting" :min="0" class="w-full" />
          </UFormField>

          <UFormField label="Warna" class="sm:col-span-2" help="Dipakai pada lencana layanan, nomor di layar antrean, dan grafik laporan.">
            <div class="flex flex-wrap items-center gap-2">
              <!--
                Warna cepat tetap ditampilkan sebagai tombol: sekali klik untuk delapan
                warna yang paling sering dipakai, tanpa harus membuka pemilih warna.
              -->
              <button
                v-for="c in PRESET_COLORS"
                :key="c"
                type="button"
                :aria-label="`Pakai warna ${c}`"
                :title="c"
                class="size-8 rounded-lg border-2 transition-transform hover:scale-110"
                :style="{ backgroundColor: c, borderColor: form.color === c ? c : 'transparent' }"
                :class="{ 'ring-2 ring-offset-2 ring-slate-400': form.color === c }"
                @click="form.color = c"
              />
              <UiColorPicker v-model="form.color" label="Warna layanan" :swatches="PRESET_COLORS" class="w-44" />
            </div>
          </UFormField>

          <div class="sm:col-span-2 flex items-center justify-between rounded-lg bg-slate-50 p-4 dark:bg-slate-800/50">
            <div>
              <p class="text-xs uppercase tracking-wide text-slate-500">
                Pratinjau nomor
              </p>
              <p class="queue-number text-2xl" :style="{ color: readable(form.color) }">
                {{ preview }}
              </p>
            </div>
            <UCheckbox v-model="form.isActive" label="Aktif" />
          </div>
        </div>
      </template>

      <template #footer="{ close }">
        <div class="flex w-full justify-end gap-2">
          <UButton variant="ghost" color="neutral" label="Batal" @click="close" />
          <UButton
            :loading="saving"
            :disabled="!form.code || form.name.trim().length < 2 || !form.prefix"
            icon="i-lucide-save"
            :label="editing ? 'Simpan Perubahan' : 'Tambah'"
            @click="save"
          />
        </div>
      </template>
    </UModal>

    <UModal
      :open="!!deleteTarget"
      title="Hapus jenis antrean?"
      :description="`&quot;${deleteTarget?.name}&quot; akan dinonaktifkan. Riwayat antrean tetap tersimpan.`"
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
