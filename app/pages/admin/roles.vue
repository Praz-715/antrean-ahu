<script setup lang="ts">
import { apiFetch } from '../../composables/useApi'
import { PERMISSIONS, PERMISSION_GROUPS } from '#shared/constants/permissions'

definePageMeta({ layout: 'admin', middleware: 'admin' })
useHead({ title: 'Role & Izin' })

interface Role {
  id: string
  key: string
  name: string
  description: string | null
  isSystem: boolean
  isGlobal: boolean
  bypassesPermissions: boolean
  permissions: string[]
  userCount: number
}

const { can } = useMe()
const { call } = useApi()

const roles = ref<Role[]>([])
const pending = ref(false)
const selectedId = ref<string | null>(null)

/**
 * Matriks izin yang sedang disunting.
 *
 * Dideklarasikan sebelum `load()` karena pemuatan pertama langsung menyelaraskannya;
 * `const` tidak bisa disentuh sebelum barisnya dijalankan, dan itu membuat seluruh
 * halaman gagal dirender di sisi server.
 */
const draft = ref<Set<string>>(new Set())

const canManage = computed(() => can(PERMISSIONS.ROLE_MANAGE))
const selected = computed(() => roles.value.find(r => r.id === selectedId.value) ?? null)

async function load() {
  pending.value = true
  try {
    roles.value = await apiFetch<Role[]>('/api/admin/roles')
    if (!roles.value.some(r => r.id === selectedId.value)) {
      selectedId.value = roles.value[0]?.id ?? null
    }
    syncDraft()
  }
  finally { pending.value = false }
}
await load()

// ---- matriks izin ----
function syncDraft() {
  draft.value = new Set(selected.value?.permissions ?? [])
}
watch(selectedId, syncDraft)

const dirty = computed(() => {
  if (!selected.value) return false
  const before = new Set(selected.value.permissions)
  if (before.size !== draft.value.size) return true
  for (const key of draft.value) if (!before.has(key)) return true
  return false
})

/** Role sistem tetap boleh disesuaikan izinnya, kecuali SUPERADMIN yang bypass. */
const editable = computed(() => canManage.value && !!selected.value && !selected.value.bypassesPermissions)

function toggle(permission: string) {
  if (!editable.value) return
  const next = new Set(draft.value)
  if (next.has(permission)) next.delete(permission)
  else next.add(permission)
  draft.value = next
}

function toggleGroup(groupPermissions: string[], on: boolean) {
  if (!editable.value) return
  const next = new Set(draft.value)
  for (const key of groupPermissions) {
    if (on) next.add(key)
    else next.delete(key)
  }
  draft.value = next
}

function groupState(groupPermissions: string[]) {
  const active = groupPermissions.filter(p => draft.value.has(p)).length
  return { active, total: groupPermissions.length, all: active === groupPermissions.length }
}

const saving = ref(false)
async function savePermissions() {
  if (!selected.value) return
  saving.value = true
  const res = await call(
    `/api/admin/roles/${selected.value.id}`,
    { method: 'PATCH', body: { permissions: [...draft.value] } },
    'Izin role disimpan',
  )
  saving.value = false
  if (res) await load()
}

// ---- role baru ----
const modalOpen = ref(false)
const creating = ref(false)
const newRole = reactive({ name: '', description: '' })

function openCreate() {
  Object.assign(newRole, { name: '', description: '' })
  modalOpen.value = true
}

async function createRole() {
  creating.value = true
  const res = await call<Role>(
    '/api/admin/roles',
    { method: 'POST', body: { name: newRole.name, description: newRole.description || null, permissions: [] } },
    'Role dibuat',
  )
  creating.value = false
  if (res) {
    modalOpen.value = false
    await load()
    selectedId.value = res.id
  }
}

const deleteTarget = ref<Role | null>(null)
async function confirmDelete() {
  if (!deleteTarget.value) return
  const res = await call(`/api/admin/roles/${deleteTarget.value.id}`, { method: 'DELETE' }, 'Role dihapus')
  deleteTarget.value = null
  if (res) { selectedId.value = null; await load() }
}

const PERMISSION_LABELS: Record<string, string> = {
  'dashboard.view': 'Lihat dashboard',
  'analytics.view': 'Lihat analitik',
  'report.view': 'Lihat laporan',
  'report.export': 'Ekspor laporan',
  'event.view': 'Lihat event',
  'event.manage': 'Kelola event',
  'event.control': 'Buka / jeda / tutup event',
  'queue_type.view': 'Lihat jenis antrean',
  'queue_type.manage': 'Kelola jenis antrean',
  'counter.manage': 'Kelola loket',
  'queue.view': 'Lihat antrean',
  'queue.view_all': 'Lihat semua antrean',
  'queue.call': 'Panggil antrean',
  'queue.recall': 'Panggil ulang',
  'queue.skip': 'Lewati antrean',
  'queue.complete': 'Selesaikan antrean',
  'queue.cancel': 'Batalkan antrean',
  'queue.reopen': 'Buka ulang antrean selesai',
  'visitor.view': 'Lihat pengunjung',
  'visitor.export': 'Ekspor pengunjung',
  'feedback.view': 'Lihat testimoni',
  'feedback.moderate': 'Moderasi testimoni',
  'user.view': 'Lihat pengguna',
  'user.manage': 'Kelola pengguna',
  'role.manage': 'Kelola role & izin',
  'assignment.manage': 'Kelola penugasan operator',
  'form.view': 'Lihat formulir',
  'form.manage': 'Kelola formulir',
  'public_page.view': 'Lihat halaman publik',
  'public_page.manage': 'Kelola halaman publik',
  'public_page.publish': 'Publikasikan halaman',
  'display.view': 'Lihat display',
  'display.manage': 'Kelola display',
  'display_template.manage': 'Kelola template display',
  'media.view': 'Lihat media',
  'media.manage': 'Kelola media',
  'announcement.manage': 'Kelola pengumuman',
  'integration.view': 'Lihat integrasi',
  'integration.manage': 'Kelola integrasi',
  'setting.view': 'Lihat pengaturan',
  'setting.manage': 'Ubah pengaturan',
  'audit.view': 'Lihat audit log',
}
</script>

<template>
  <div>
    <UiPageHeading
      title="Role & Izin"
      icon="i-lucide-shield-check"
      description="Kode aplikasi selalu memeriksa izin, bukan nama role. Menambah izin di sini langsung berlaku untuk semua penggunanya."
    >
      <template #actions>
        <UButton v-if="canManage" icon="i-lucide-plus" label="Role Baru" @click="openCreate" />
      </template>
    </UiPageHeading>

    <div v-if="pending && !roles.length" class="grid gap-4 lg:grid-cols-12">
      <USkeleton class="h-64 w-full lg:col-span-4" />
      <USkeleton class="h-64 w-full lg:col-span-8" />
    </div>

    <div v-else class="grid gap-4 lg:grid-cols-12">
      <!-- Daftar role -->
      <div class="space-y-2 lg:col-span-4">
        <button
          v-for="role in roles"
          :key="role.id"
          type="button"
          class="w-full rounded-xl border p-4 text-left transition-colors"
          :class="role.id === selectedId
            ? 'border-brand-500 bg-brand-50 dark:border-brand-500 dark:bg-brand-950/40'
            : 'border-slate-200 bg-white hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800/50'"
          @click="selectedId = role.id"
        >
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0">
              <p class="truncate font-semibold">
                {{ role.name }}
              </p>
              <p class="font-mono text-xs text-slate-400">
                {{ role.key }}
              </p>
            </div>
            <UBadge
              size="sm"
              variant="subtle"
              :color="role.isSystem ? 'neutral' : 'primary'"
              :label="role.isSystem ? 'Bawaan' : 'Kustom'"
            />
          </div>
          <p class="mt-2 text-xs text-slate-500">
            {{ role.bypassesPermissions ? 'Seluruh izin (bypass)' : `${role.permissions.length} izin` }}
            · {{ role.userCount }} pengguna
          </p>
        </button>
      </div>

      <!-- Matriks izin -->
      <div v-if="selected" class="lg:col-span-8">
        <div class="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <header class="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 p-5 dark:border-slate-800">
            <div>
              <h2 class="font-semibold">
                {{ selected.name }}
              </h2>
              <p class="mt-0.5 text-sm text-slate-500">
                {{ selected.description || 'Tanpa deskripsi' }}
              </p>
            </div>
            <UButton
              v-if="canManage && !selected.isSystem"
              size="xs"
              variant="ghost"
              color="error"
              icon="i-lucide-trash-2"
              label="Hapus role"
              @click="deleteTarget = selected"
            />
          </header>

          <UAlert
            v-if="selected.bypassesPermissions"
            class="m-5"
            color="warning"
            variant="soft"
            icon="i-lucide-key-round"
            title="Role ini melewati seluruh pemeriksaan izin"
            description="SUPERADMIN selalu diizinkan, jadi daftar izin di bawah tidak berpengaruh dan sengaja dikunci."
          />

          <div class="divide-y divide-slate-100 dark:divide-slate-800">
            <section v-for="(groupPermissions, groupName) in PERMISSION_GROUPS" :key="groupName" class="p-5">
              <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h3 class="text-sm font-semibold">
                  {{ groupName }}
                  <span class="ml-1 text-xs font-normal text-slate-400">
                    {{ groupState(groupPermissions).active }}/{{ groupState(groupPermissions).total }}
                  </span>
                </h3>
                <UButton
                  v-if="editable"
                  size="xs"
                  variant="ghost"
                  color="neutral"
                  :label="groupState(groupPermissions).all ? 'Kosongkan' : 'Pilih semua'"
                  @click="toggleGroup(groupPermissions, !groupState(groupPermissions).all)"
                />
              </div>

              <div class="grid gap-2 sm:grid-cols-2">
                <label
                  v-for="permission in groupPermissions"
                  :key="permission"
                  class="flex items-start gap-2 rounded-lg px-2 py-1.5 text-sm"
                  :class="editable ? 'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50' : 'opacity-60'"
                >
                  <UCheckbox
                    :model-value="selected.bypassesPermissions || draft.has(permission)"
                    :disabled="!editable"
                    @update:model-value="() => toggle(permission)"
                  />
                  <span>
                    {{ PERMISSION_LABELS[permission] ?? permission }}
                    <span class="block font-mono text-xs text-slate-400">{{ permission }}</span>
                  </span>
                </label>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>

    <!-- Bilah simpan -->
    <Transition
      enter-active-class="transition duration-200"
      enter-from-class="translate-y-4 opacity-0"
      leave-active-class="transition duration-150"
      leave-to-class="translate-y-4 opacity-0"
    >
      <div
        v-if="dirty && editable"
        class="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 p-3 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95 lg:pl-64"
      >
        <div class="mx-auto flex max-w-5xl items-center gap-3 px-2">
          <p class="flex-1 text-sm">
            Perubahan izin <span class="font-semibold">{{ selected?.name }}</span> belum disimpan
          </p>
          <UButton variant="ghost" color="neutral" label="Batalkan" @click="syncDraft" />
          <UButton icon="i-lucide-save" label="Simpan Izin" :loading="saving" @click="savePermissions" />
        </div>
      </div>
    </Transition>

    <UModal
      v-model:open="modalOpen"
      title="Role Baru"
      description="Role dibuat tanpa izin. Centang izinnya setelah role tersimpan."
    >
      <template #body>
        <div class="space-y-4">
          <UFormField label="Nama role" required help="Kode role dibuat otomatis dari nama, mis. Kepala Loket → KEPALA_LOKET">
            <UInput v-model="newRole.name" class="w-full" placeholder="Kepala Loket" />
          </UFormField>
          <UFormField label="Deskripsi" hint="opsional">
            <UTextarea v-model="newRole.description" :rows="2" class="w-full" />
          </UFormField>
        </div>
      </template>

      <template #footer="{ close }">
        <div class="flex w-full justify-end gap-2">
          <UButton variant="ghost" color="neutral" label="Batal" @click="close" />
          <UButton :loading="creating" :disabled="newRole.name.trim().length < 3" icon="i-lucide-save" label="Buat" @click="createRole" />
        </div>
      </template>
    </UModal>

    <UModal
      :open="!!deleteTarget"
      title="Hapus role?"
      description="Role hanya bisa dihapus bila tidak ada pengguna yang memakainya."
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
