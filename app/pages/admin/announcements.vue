<script setup lang="ts">
import { apiFetch } from '../../composables/useApi'
import { PERMISSIONS } from '#shared/constants/permissions'

definePageMeta({ layout: 'admin', middleware: 'admin' })
useHead({ title: 'Pengumuman' })

interface Announcement {
  id: string
  title: string | null
  message: string
  type: 'TEXT' | 'RUNNING_TEXT'
  priority: number
  startsAt: string | null
  endsAt: string | null
  isActive: boolean
  createdAt: string
}

const { can } = useMe()
const { call } = useApi()
// Waktu acuan bersama SSR & klien (lihat useNow) agar label waktu tidak mismatch.
const now = useNow()
const { currentId, loadEvents } = useCurrentEvent()
await loadEvents()

const items = ref<Announcement[]>([])
const pending = ref(false)

async function load() {
  if (!currentId.value) { items.value = []; return }
  pending.value = true
  try {
    items.value = await apiFetch<Announcement[]>('/api/admin/announcements', { query: { eventId: currentId.value } })
  }
  finally { pending.value = false }
}
watch(currentId, load, { immediate: true })

const modalOpen = ref(false)
const editing = ref<Announcement | null>(null)
const saving = ref(false)
const form = reactive({
  title: '',
  message: '',
  type: 'RUNNING_TEXT' as 'TEXT' | 'RUNNING_TEXT',
  priority: 0,
  startsAt: '',
  endsAt: '',
  isActive: true,
})

function toLocalInput(value: string | null) {
  if (!value) return ''
  const d = new Date(value)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function openCreate() {
  editing.value = null
  Object.assign(form, { title: '', message: '', type: 'RUNNING_TEXT', priority: 0, startsAt: '', endsAt: '', isActive: true })
  modalOpen.value = true
}

function openEdit(item: Announcement) {
  editing.value = item
  Object.assign(form, {
    title: item.title ?? '',
    message: item.message,
    type: item.type,
    priority: item.priority,
    startsAt: toLocalInput(item.startsAt),
    endsAt: toLocalInput(item.endsAt),
    isActive: item.isActive,
  })
  modalOpen.value = true
}

async function save() {
  saving.value = true
  const body = {
    title: form.title || null,
    message: form.message,
    type: form.type,
    priority: Number(form.priority),
    startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : null,
    endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : null,
    isActive: form.isActive,
  }
  const res = editing.value
    ? await call(`/api/admin/announcements/${editing.value.id}`, { method: 'PATCH', body }, 'Pengumuman diperbarui')
    : await call('/api/admin/announcements', { method: 'POST', body: { ...body, eventId: currentId.value } }, 'Pengumuman dibuat')
  saving.value = false
  if (res) { modalOpen.value = false; await load() }
}

const deleteTarget = ref<Announcement | null>(null)
async function confirmDelete() {
  if (!deleteTarget.value) return
  const res = await call(`/api/admin/announcements/${deleteTarget.value.id}`, { method: 'DELETE' }, 'Pengumuman dihapus')
  deleteTarget.value = null
  if (res) await load()
}

async function toggleActive(item: Announcement) {
  await call(`/api/admin/announcements/${item.id}`, { method: 'PATCH', body: { isActive: !item.isActive } })
  await load()
}

function scheduleLabel(item: Announcement) {
  const fmt = (v: string) => new Date(v).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  if (item.startsAt && item.endsAt) return `${fmt(item.startsAt)} – ${fmt(item.endsAt)}`
  if (item.startsAt) return `mulai ${fmt(item.startsAt)}`
  if (item.endsAt) return `sampai ${fmt(item.endsAt)}`
  return 'Selalu tampil'
}

/**
 * Sedang benar-benar tampil di layar saat ini?
 *
 * Memakai waktu acuan bersama: bila jadwalnya berakhir tepat di antara render server
 * dan hidrasi klien, lencana serta kelasnya akan berbeda dan memicu mismatch.
 */
function isLive(item: Announcement) {
  if (!item.isActive) return false
  const at = now.value
  if (item.startsAt && new Date(item.startsAt).getTime() > at) return false
  if (item.endsAt && new Date(item.endsAt).getTime() < at) return false
  return true
}

const runningPreview = computed(() =>
  items.value.filter(isLive).sort((a, b) => b.priority - a.priority).map(a => a.message).join('   •   '))
</script>

<template>
  <div>
    <UiPageHeading
      title="Pengumuman Display"
      icon="i-lucide-megaphone"
      description="Teks yang berjalan di bagian bawah layar antrean. Perubahan langsung terkirim ke semua display yang menyala."
    >
      <template #actions>
        <UiEventPicker />
        <UButton
          v-if="can(PERMISSIONS.ANNOUNCEMENT_MANAGE)"
          icon="i-lucide-plus"
          label="Pengumuman Baru"
          :disabled="!currentId"
          @click="openCreate"
        />
      </template>
    </UiPageHeading>

    <!-- Pratinjau persis seperti di layar -->
    <div class="mb-4 overflow-hidden rounded-xl bg-slate-900 px-6 py-3">
      <p class="mb-1 text-xs uppercase tracking-wide text-slate-500">
        Pratinjau teks berjalan
      </p>
      <p class="truncate text-slate-200">
        {{ runningPreview || 'Belum ada pengumuman yang aktif — bagian bawah display akan menampilkan status layanan.' }}
      </p>
    </div>

    <div v-if="pending && !items.length" class="space-y-3">
      <USkeleton v-for="i in 2" :key="i" class="h-24 w-full" />
    </div>

    <div v-else-if="!items.length" class="rounded-xl border border-dashed border-slate-300 py-16 text-center dark:border-slate-700">
      <UIcon name="i-lucide-megaphone" class="mx-auto size-10 text-slate-400" />
      <p class="mt-3 font-medium">
        Belum ada pengumuman
      </p>
      <p class="mx-auto mt-1 max-w-md text-sm text-slate-500">
        Misalnya jam istirahat, informasi loket tutup, atau imbauan bagi pengunjung.
      </p>
      <UButton
        v-if="can(PERMISSIONS.ANNOUNCEMENT_MANAGE)"
        class="mt-4"
        icon="i-lucide-plus"
        label="Buat Pengumuman"
        :disabled="!currentId"
        @click="openCreate"
      />
    </div>

    <div v-else class="space-y-3">
      <div
        v-for="item in items"
        :key="item.id"
        class="flex flex-wrap items-start gap-4 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
        :class="{ 'opacity-60': !item.isActive }"
      >
        <div
          class="flex size-10 shrink-0 items-center justify-center rounded-lg"
          :class="isLive(item) ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-slate-100 text-slate-500 dark:bg-slate-800'"
        >
          <UIcon :name="item.type === 'RUNNING_TEXT' ? 'i-lucide-scroll-text' : 'i-lucide-message-square'" class="size-5" />
        </div>

        <div class="min-w-48 flex-1">
          <p v-if="item.title" class="font-semibold">
            {{ item.title }}
          </p>
          <p class="text-sm text-slate-600 dark:text-slate-300">
            {{ item.message }}
          </p>
          <p class="mt-1 text-xs text-slate-400">
            {{ scheduleLabel(item) }} · prioritas {{ item.priority }}
          </p>
        </div>

        <UBadge
          size="sm"
          variant="subtle"
          :color="isLive(item) ? 'success' : 'neutral'"
          :label="isLive(item) ? 'Tampil sekarang' : item.isActive ? 'Terjadwal' : 'Nonaktif'"
        />

        <UDropdownMenu
          v-if="can(PERMISSIONS.ANNOUNCEMENT_MANAGE)"
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

    <UModal
      v-model:open="modalOpen"
      :title="editing ? 'Ubah Pengumuman' : 'Pengumuman Baru'"
      description="Kosongkan jadwal bila ingin pengumuman tampil terus-menerus."
    >
      <template #body>
        <div class="space-y-4">
          <UFormField label="Judul" hint="opsional">
            <UInput v-model="form.title" class="w-full" placeholder="Informasi Layanan" />
          </UFormField>

          <UFormField label="Pesan" required>
            <UTextarea v-model="form.message" :rows="3" class="w-full" placeholder="Layanan istirahat pukul 12.00 – 13.00" />
          </UFormField>

          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField label="Tipe">
              <USelect
                v-model="form.type"
                :items="[
                  { label: 'Teks berjalan', value: 'RUNNING_TEXT' },
                  { label: 'Teks diam', value: 'TEXT' },
                ]"
                class="w-full"
              />
            </UFormField>
            <UFormField label="Prioritas" help="Angka lebih besar tampil lebih dulu.">
              <UInputNumber v-model="form.priority" :min="0" :max="100" class="w-full" />
            </UFormField>
            <UFormField label="Mulai tampil" hint="opsional">
              <UInput v-model="form.startsAt" type="datetime-local" class="w-full" />
            </UFormField>
            <UFormField label="Berhenti tampil" hint="opsional">
              <UInput v-model="form.endsAt" type="datetime-local" class="w-full" />
            </UFormField>
          </div>

          <UCheckbox v-model="form.isActive" label="Aktif" />
        </div>
      </template>

      <template #footer="{ close }">
        <div class="flex w-full justify-end gap-2">
          <UButton variant="ghost" color="neutral" label="Batal" @click="close" />
          <UButton :loading="saving" :disabled="form.message.trim().length < 1" icon="i-lucide-save" :label="editing ? 'Simpan' : 'Buat'" @click="save" />
        </div>
      </template>
    </UModal>

    <UModal
      :open="!!deleteTarget"
      title="Hapus pengumuman?"
      description="Pengumuman akan langsung hilang dari semua layar."
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
