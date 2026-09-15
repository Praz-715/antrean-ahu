<script setup lang="ts">
import { apiFetch } from '../../composables/useApi'
import { nullableValue, SELECT_NONE } from '#shared/constants/ui'
import { PERMISSIONS } from '#shared/constants/permissions'

definePageMeta({ layout: 'admin', middleware: 'admin' })
useHead({ title: 'Perangkat Display' })

interface DisplayRow {
  id: string
  deviceCode: string
  name: string
  type: 'GLOBAL' | 'QUEUE_TYPE'
  status: 'UNPAIRED' | 'ONLINE' | 'OFFLINE'
  lastSeenAt: string | null
  queueType: { id: string, code: string, name: string } | null
  template: { id: string, name: string } | null
  templateId: string | null
  event: { id: string, name: string }
}

const { can } = useMe()
const { call } = useApi()
// Waktu acuan bersama SSR & klien (lihat useNow) agar label waktu tidak mismatch.
const now = useNow()
const toast = useToast()
const { currentId, loadEvents } = useCurrentEvent()
await loadEvents()

const devices = ref<DisplayRow[]>([])
const queueTypes = ref<Array<{ id: string, code: string, name: string }>>([])
const templates = ref<Array<{ id: string, name: string }>>([])
const pending = ref(false)

async function load() {
  if (!currentId.value) { devices.value = []; return }
  pending.value = true
  try {
    const [list, types, templateList] = await Promise.all([
      apiFetch<DisplayRow[]>('/api/admin/displays', { query: { eventId: currentId.value } }),
      apiFetch<typeof queueTypes.value>('/api/admin/queue-types', { query: { eventId: currentId.value } }),
      apiFetch<typeof templates.value>('/api/admin/display-templates', { query: { eventId: currentId.value } }),
    ])
    devices.value = list
    queueTypes.value = types
    templates.value = templateList
  }
  finally { pending.value = false }
}
watch(currentId, load, { immediate: true })

// perbarui indikator ONLINE/OFFLINE secara berkala
let timer: ReturnType<typeof setInterval>
onMounted(() => { timer = setInterval(load, 20_000) })
onBeforeUnmount(() => clearInterval(timer))

const modalOpen = ref(false)
const saving = ref(false)
const form = reactive({ name: '', type: 'GLOBAL' as 'GLOBAL' | 'QUEUE_TYPE', queueTypeId: '' })

function openCreate() {
  Object.assign(form, { name: '', type: 'GLOBAL', queueTypeId: queueTypes.value[0]?.id ?? '' })
  modalOpen.value = true
}

async function save() {
  saving.value = true
  const res = await call(
    '/api/admin/displays',
    {
      method: 'POST',
      body: {
        eventId: currentId.value,
        name: form.name,
        type: form.type,
        queueTypeId: form.type === 'QUEUE_TYPE' ? form.queueTypeId : null,
      },
    },
    'Perangkat display dibuat',
  )
  saving.value = false
  if (res) { modalOpen.value = false; await load() }
}

const deleteTarget = ref<DisplayRow | null>(null)
async function confirmDelete() {
  if (!deleteTarget.value) return
  const res = await call(`/api/admin/displays/${deleteTarget.value.id}`, { method: 'DELETE' }, 'Perangkat dihapus')
  deleteTarget.value = null
  if (res) await load()
}

/** Pasang tata letak buatan Display Builder ke satu perangkat. */
async function assignTemplate(device: DisplayRow, templateId: string) {
  await call(
    `/api/admin/displays/${device.id}`,
    { method: 'PATCH', body: { templateId: nullableValue(templateId) } },
    nullableValue(templateId) ? 'Template dipasang' : 'Kembali ke tata letak bawaan',
  )
  await load()
}

async function resetPairing(device: DisplayRow) {
  await call(`/api/admin/displays/${device.id}/reset-pairing`, { method: 'POST' }, 'Pairing direset')
  await load()
}

function displayUrl(device: DisplayRow) {
  return `${window.location.origin}/display/${device.deviceCode}`
}

async function copyUrl(device: DisplayRow) {
  await navigator.clipboard.writeText(displayUrl(device))
  toast.add({ title: 'Tautan display disalin', color: 'success', icon: 'i-lucide-copy' })
}

function statusMeta(device: DisplayRow) {
  if (device.status === 'ONLINE') return { color: 'success', label: 'Online', dot: 'bg-emerald-500 animate-pulse' }
  if (device.status === 'OFFLINE') return { color: 'error', label: 'Offline', dot: 'bg-rose-500' }
  return { color: 'neutral', label: 'Belum dipasangkan', dot: 'bg-slate-400' }
}

function lastSeen(value: string | null) {
  if (!value) return 'Belum pernah terhubung'
  // Waktu acuan bersama supaya label ini tidak memicu mismatch hidrasi.
  const diff = now.value - new Date(value).getTime()
  const minutes = Math.round(diff / 60000)
  if (minutes < 1) return 'Baru saja'
  if (minutes < 60) return `${minutes} menit lalu`
  return new Date(value).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}
</script>

<template>
  <div>
    <UiPageHeading
      title="Perangkat Display"
      icon="i-lucide-tv"
      description="Layar yang menampilkan nomor antrean. Buka tautannya di perangkat layar, dan pairing terjadi otomatis pada kunjungan pertama."
    >
      <template #actions>
        <UiEventPicker />
        <UButton
          v-if="can(PERMISSIONS.DISPLAY_MANAGE)"
          icon="i-lucide-plus"
          label="Display Baru"
          :disabled="!currentId"
          @click="openCreate"
        />
      </template>
    </UiPageHeading>

    <div v-if="pending && !devices.length" class="grid gap-4 md:grid-cols-2">
      <USkeleton v-for="i in 2" :key="i" class="h-40" />
    </div>

    <div v-else-if="!devices.length" class="rounded-xl border border-dashed border-slate-300 py-16 text-center dark:border-slate-700">
      <UIcon name="i-lucide-tv" class="mx-auto size-10 text-slate-400" />
      <p class="mt-3 font-medium">
        Belum ada perangkat display
      </p>
      <p class="mx-auto mt-1 max-w-md text-sm text-slate-500">
        Buat satu display global untuk lobby, dan display khusus untuk tiap ruang layanan bila diperlukan.
      </p>
      <UButton
        v-if="can(PERMISSIONS.DISPLAY_MANAGE)"
        class="mt-4"
        icon="i-lucide-plus"
        label="Buat Display"
        :disabled="!currentId"
        @click="openCreate"
      />
    </div>

    <div v-else class="grid gap-4 md:grid-cols-2">
      <div
        v-for="device in devices"
        :key="device.id"
        class="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <p class="truncate font-semibold">
              {{ device.name }}
            </p>
            <p class="text-sm text-slate-500">
              {{ device.type === 'GLOBAL' ? 'Display global — semua layanan' : `Khusus ${device.queueType?.name}` }}
            </p>
          </div>
          <span class="flex items-center gap-1.5 whitespace-nowrap rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium dark:bg-slate-800">
            <span class="size-1.5 rounded-full" :class="statusMeta(device).dot" />
            {{ statusMeta(device).label }}
          </span>
        </div>

        <div class="mt-4 flex items-center gap-2 rounded-lg bg-slate-50 p-2 dark:bg-slate-800/50">
          <UIcon name="i-lucide-monitor" class="size-4 shrink-0 text-slate-400" />
          <code class="min-w-0 flex-1 truncate text-xs">/display/{{ device.deviceCode }}</code>
          <UButton icon="i-lucide-copy" aria-label="Salin tautan layar" title="Salin tautan layar" size="xs" variant="ghost" color="neutral" @click="copyUrl(device)" />
          <UButton icon="i-lucide-external-link" aria-label="Buka layar di tab baru" title="Buka layar di tab baru" size="xs" variant="ghost" color="neutral" :to="`/display/${device.deviceCode}`" target="_blank" />
        </div>

        <div v-if="can(PERMISSIONS.DISPLAY_MANAGE)" class="mt-3">
          <label class="mb-1 block text-xs text-slate-500">Tata letak</label>
          <USelect
            :model-value="device.templateId ?? SELECT_NONE"
            :items="[{ label: 'Bawaan sistem', value: SELECT_NONE }, ...templates.map(t => ({ label: t.name, value: t.id }))]"
            size="sm"
            class="w-full"
            @update:model-value="(v) => assignTemplate(device, v as string)"
          />
        </div>

        <p class="mt-3 text-xs text-slate-500">
          Terakhir terlihat: {{ lastSeen(device.lastSeenAt) }}
        </p>

        <div v-if="can(PERMISSIONS.DISPLAY_MANAGE)" class="mt-4 flex gap-2">
          <UiActionButton
            size="sm"
            variant="outline"
            color="neutral"
            icon="i-lucide-rotate-ccw"
            label="Reset Pairing"
            :action="() => resetPairing(device)"
          />
          <UButton size="sm" variant="ghost" color="error" icon="i-lucide-trash-2" aria-label="Hapus perangkat" title="Hapus perangkat" @click="deleteTarget = device" />
        </div>
      </div>
    </div>

    <UModal v-model:open="modalOpen" title="Display Baru" description="Display global menampilkan semua layanan; display khusus hanya satu layanan.">
      <template #body>
        <div class="space-y-4">
          <UFormField label="Nama Display" required>
            <UInput v-model="form.name" class="w-full" placeholder="Lobby Utama" />
          </UFormField>

          <UFormField label="Tipe">
            <USelect
              v-model="form.type"
              :items="[
                { label: 'Global — semua layanan', value: 'GLOBAL' },
                { label: 'Khusus satu layanan', value: 'QUEUE_TYPE' },
              ]"
              class="w-full"
            />
          </UFormField>

          <UFormField v-if="form.type === 'QUEUE_TYPE'" label="Jenis Antrean" required>
            <USelect
              v-model="form.queueTypeId"
              :items="queueTypes.map(t => ({ label: `${t.code} · ${t.name}`, value: t.id }))"
              class="w-full"
            />
          </UFormField>
        </div>
      </template>

      <template #footer="{ close }">
        <div class="flex w-full justify-end gap-2">
          <UButton variant="ghost" color="neutral" label="Batal" @click="close" />
          <UButton
            :loading="saving"
            :disabled="form.name.trim().length < 2 || (form.type === 'QUEUE_TYPE' && !form.queueTypeId)"
            icon="i-lucide-save"
            label="Buat"
            @click="save"
          />
        </div>
      </template>
    </UModal>

    <UModal
      :open="!!deleteTarget"
      title="Hapus perangkat display?"
      :description="`&quot;${deleteTarget?.name}&quot; tidak akan bisa diakses lagi.`"
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
