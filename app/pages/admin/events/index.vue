<script setup lang="ts">

import { EVENT_STATUS_COLOR, EVENT_STATUS_LABEL } from '#shared/utils/queue-format'
import { PERMISSIONS } from '#shared/constants/permissions'

definePageMeta({ layout: 'admin', middleware: 'admin' })
useHead({ title: 'Event' })

const { can } = useMe()
const { call } = useApi()
const { events, loadEvents, setCurrent } = useCurrentEvent()

const pending = ref(false)
const search = ref('')

async function refresh() {
  pending.value = true
  try { await loadEvents(true) }
  finally { pending.value = false }
}

await loadEvents()

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return events.value
  return events.value.filter(e => e.name.toLowerCase().includes(q) || e.slug.includes(q))
})

// ---- buat event ----
const createOpen = ref(false)
const saving = ref(false)
const form = reactive({
  name: '',
  description: '',
  timezone: 'Asia/Jakarta',
  allowFinishAfterClose: true,
})

const timezones = [
  { label: 'WIB — Asia/Jakarta', value: 'Asia/Jakarta' },
  { label: 'WITA — Asia/Makassar', value: 'Asia/Makassar' },
  { label: 'WIT — Asia/Jayapura', value: 'Asia/Jayapura' },
]

async function createEvent() {
  saving.value = true
  const created = await call<{ id: string }>(
    '/api/admin/events',
    { method: 'POST', body: { ...form, description: form.description || undefined } },
    'Event berhasil dibuat',
  )
  saving.value = false

  if (created) {
    createOpen.value = false
    form.name = ''
    form.description = ''
    await refresh()
    setCurrent(created.id)
    await navigateTo(`/admin/events/${created.id}`)
  }
}

// ---- kontrol status ----
const statusPending = ref<string | null>(null)

async function setStatus(id: string, status: string) {
  statusPending.value = id
  await call(`/api/admin/events/${id}/status`, { method: 'POST', body: { status } }, 'Status event diperbarui')
  statusPending.value = null
  await refresh()
}

function statusActions(event: { id: string, status: string }) {
  const actions: Array<{ label: string, icon: string, status: string }> = []
  if (event.status !== 'OPEN') actions.push({ label: 'Buka antrean', icon: 'i-lucide-play', status: 'OPEN' })
  if (event.status === 'OPEN') actions.push({ label: 'Jeda', icon: 'i-lucide-pause', status: 'PAUSED' })
  if (event.status !== 'CLOSED' && event.status !== 'COMPLETED') {
    actions.push({ label: 'Tutup', icon: 'i-lucide-square', status: 'CLOSED' })
  }
  return actions.map(a => ({
    label: a.label,
    icon: a.icon,
    onSelect: () => setStatus(event.id, a.status),
  }))
}

// ---- hapus ----
const deleteTarget = ref<{ id: string, name: string } | null>(null)
const deleting = ref(false)

async function confirmDelete() {
  if (!deleteTarget.value) return
  deleting.value = true
  const res = await call(`/api/admin/events/${deleteTarget.value.id}`, { method: 'DELETE' }, 'Event dihapus')
  deleting.value = false
  if (res) {
    deleteTarget.value = null
    await refresh()
  }
}
</script>

<template>
  <div>
    <UiPageHeading
      title="Event / Sesi Layanan"
      icon="i-lucide-calendar-days"
      description="Setiap event punya jenis antrean, formulir, display, dan operator sendiri — data antar event tidak tercampur."
    >
      <template #actions>
        <UInput
          v-model="search"
          icon="i-lucide-search"
          placeholder="Cari event…"
          class="w-56"
        />
        <UButton
          v-if="can(PERMISSIONS.EVENT_MANAGE)"
          icon="i-lucide-plus"
          label="Event Baru"
          @click="createOpen = true"
        />
      </template>
    </UiPageHeading>

    <div v-if="!filtered.length" class="rounded-xl border border-dashed border-slate-300 py-16 text-center dark:border-slate-700">
      <UIcon name="i-lucide-calendar-plus" class="mx-auto size-10 text-slate-400" />
      <p class="mt-3 font-medium">
        Belum ada event
      </p>
      <p class="mt-1 text-sm text-slate-500">
        Buat event pertama Anda, misalnya "Pelayanan Harian" atau "Festival AHU 2026".
      </p>
      <UButton
        v-if="can(PERMISSIONS.EVENT_MANAGE)"
        class="mt-4"
        icon="i-lucide-plus"
        label="Buat Event"
        @click="createOpen = true"
      />
    </div>

    <div v-else class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <div
        v-for="event in filtered"
        :key="event.id"
        class="group flex flex-col rounded-xl border border-slate-200 bg-white p-5 transition-shadow hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
      >
        <div class="mb-3 flex items-start justify-between gap-2">
          <div class="min-w-0">
            <NuxtLink
              :to="`/admin/events/${event.id}`"
              class="block truncate font-semibold hover:text-brand-600"
            >
              {{ event.name }}
            </NuxtLink>
            <p class="truncate text-xs text-slate-400">
              /{{ event.slug }} · {{ event.timezone }}
            </p>
          </div>

          <UDropdownMenu
            :items="[
              statusActions(event),
              [
                { label: 'Kelola', icon: 'i-lucide-settings-2', to: `/admin/events/${event.id}` },
                { label: 'Jadikan event aktif', icon: 'i-lucide-check', onSelect: () => setCurrent(event.id) },
              ],
              can(PERMISSIONS.EVENT_MANAGE)
                ? [{ label: 'Hapus', icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: () => (deleteTarget = { id: event.id, name: event.name }) }]
                : [],
            ]"
          >
            <UButton
              icon="i-lucide-ellipsis-vertical"
              aria-label="Menu tindakan event"
              title="Menu tindakan event"
              variant="ghost"
              color="neutral"
              size="xs"
              :loading="statusPending === event.id"
            />
          </UDropdownMenu>
        </div>

        <UBadge
          class="self-start"
          variant="subtle"
          :color="(EVENT_STATUS_COLOR[event.status] as never) ?? 'neutral'"
          :label="EVENT_STATUS_LABEL[event.status] ?? event.status"
        />

        <p v-if="event.description" class="mt-3 line-clamp-2 text-sm text-slate-500">
          {{ event.description }}
        </p>

        <div class="mt-4 flex gap-4 border-t border-slate-100 pt-3 text-sm dark:border-slate-800">
          <div>
            <span class="font-semibold">{{ event._count?.queueTypes ?? 0 }}</span>
            <span class="ml-1 text-slate-500">layanan</span>
          </div>
          <div>
            <span class="font-semibold">{{ event._count?.counters ?? 0 }}</span>
            <span class="ml-1 text-slate-500">loket</span>
          </div>
          <div>
            <span class="font-semibold">{{ event._count?.queues ?? 0 }}</span>
            <span class="ml-1 text-slate-500">antrean</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Modal buat event -->
    <UModal v-model:open="createOpen" title="Event Baru" description="Wadah untuk jenis antrean, formulir, dan display.">
      <template #body>
        <div class="space-y-4">
          <UFormField label="Nama Event" required>
            <UInput v-model="form.name" placeholder="mis. Pelayanan Administrasi" class="w-full" />
          </UFormField>

          <UFormField label="Deskripsi" hint="opsional">
            <UTextarea v-model="form.description" :rows="3" class="w-full" placeholder="Keterangan singkat" />
          </UFormField>

          <UFormField label="Zona Waktu" help="Tanggal layanan & jam buka-tutup dihitung memakai zona waktu ini.">
            <USelect v-model="form.timezone" :items="timezones" class="w-full" />
          </UFormField>

          <UCheckbox
            v-model="form.allowFinishAfterClose"
            label="Operator boleh menyelesaikan antrean berjalan setelah jam tutup"
          />
        </div>
      </template>

      <template #footer="{ close }">
        <div class="flex w-full justify-end gap-2">
          <UButton variant="ghost" color="neutral" label="Batal" @click="close" />
          <UButton
            :loading="saving"
            :disabled="form.name.trim().length < 3"
            label="Buat Event"
            icon="i-lucide-plus"
            @click="createEvent"
          />
        </div>
      </template>
    </UModal>

    <!-- Konfirmasi hapus -->
    <UModal
      :open="!!deleteTarget"
      title="Hapus event?"
      :description="`Event &quot;${deleteTarget?.name}&quot; akan disembunyikan. Riwayat antrean tetap tersimpan.`"
      @update:open="(v) => { if (!v) deleteTarget = null }"
    >
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton variant="ghost" color="neutral" label="Batal" @click="deleteTarget = null" />
          <UButton color="error" :loading="deleting" label="Hapus" icon="i-lucide-trash-2" @click="confirmDelete" />
        </div>
      </template>
    </UModal>
  </div>
</template>
