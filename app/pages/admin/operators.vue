<script setup lang="ts">
import { apiFetch } from '../../composables/useApi'
import { PERMISSIONS } from '#shared/constants/permissions'

definePageMeta({ layout: 'admin', middleware: 'admin' })
useHead({ title: 'Pengguna' })

interface Role { id: string, key: string, name: string, isSystem: boolean }
interface UserRow {
  id: string
  name: string
  email: string
  username: string | null
  phone: string | null
  isActive: boolean
  lastLoginAt: string | null
  createdAt: string
  roles: Role[]
  /** Satu loket per operator; layanannya milik loket itu (§28). */
  placement: {
    id: string
    counter: { id: string, code: string, name: string }
    event: { id: string, name: string }
    services: Array<{ id: string, code: string, name: string, color: string }>
  } | null
}

const { can, me } = useMe()
const now = useNow()
// Warna layanan dipilih admin; disesuaikan agar tetap terbaca di tema gelap.
const { readable } = useReadableColor()
const { call } = useApi()

const users = ref<UserRow[]>([])
const roles = ref<Role[]>([])
const pending = ref(false)
const search = ref('')

async function load() {
  pending.value = true
  try {
    const data = await apiFetch<{ users: UserRow[], roles: Role[] }>('/api/admin/users', {
      query: search.value ? { search: search.value } : {},
    })
    users.value = data.users
    roles.value = data.roles
  }
  finally { pending.value = false }
}
await load()

let searchTimer: ReturnType<typeof setTimeout>
watch(search, () => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(load, 300)
})

// ---- form ----
const modalOpen = ref(false)
const editing = ref<UserRow | null>(null)
const saving = ref(false)
const form = reactive({ name: '', email: '', password: '', username: '', phone: '', roleId: '', isActive: true })

function openCreate() {
  editing.value = null
  Object.assign(form, {
    name: '',
    email: '',
    password: '',
    username: '',
    phone: '',
    roleId: roles.value.find(r => r.key === 'OPERATOR')?.id ?? roles.value[0]?.id ?? '',
    isActive: true,
  })
  modalOpen.value = true
}

function openEdit(user: UserRow) {
  editing.value = user
  Object.assign(form, {
    name: user.name,
    email: user.email,
    password: '',
    username: user.username ?? '',
    phone: user.phone ?? '',
    roleId: user.roles[0]?.id ?? '',
    isActive: user.isActive,
  })
  modalOpen.value = true
}

async function save() {
  saving.value = true
  const res = editing.value
    ? await call(
        `/api/admin/users/${editing.value.id}`,
        { method: 'PATCH', body: { name: form.name, username: form.username || null, phone: form.phone || null, isActive: form.isActive, roleId: form.roleId } },
        'Pengguna diperbarui',
      )
    : await call(
        '/api/admin/users',
        { method: 'POST', body: { name: form.name, email: form.email, password: form.password, username: form.username || null, phone: form.phone || null, roleId: form.roleId } },
        'Pengguna dibuat',
      )
  saving.value = false
  if (res) { modalOpen.value = false; await load() }
}

// ---- reset kata sandi ----
const passwordTarget = ref<UserRow | null>(null)
const newPassword = ref('')
const resetting = ref(false)

async function resetPassword() {
  if (!passwordTarget.value) return
  resetting.value = true
  const res = await call(
    `/api/admin/users/${passwordTarget.value.id}/password`,
    { method: 'POST', body: { password: newPassword.value } },
    'Kata sandi direset',
  )
  resetting.value = false
  if (res) { passwordTarget.value = null; newPassword.value = '' }
}

// ---- hapus ----
const deleteTarget = ref<UserRow | null>(null)
const deleting = ref(false)
async function confirmDelete() {
  if (!deleteTarget.value) return
  deleting.value = true
  const res = await call(`/api/admin/users/${deleteTarget.value.id}`, { method: 'DELETE' }, 'Pengguna dihapus')
  deleting.value = false
  if (res) { deleteTarget.value = null; await load() }
}

const roleOptions = computed(() => roles.value.map(r => ({ label: r.name, value: r.id })))

function roleColor(key: string) {
  return key === 'SUPERADMIN' ? 'error' : key === 'ADMIN' ? 'primary' : key === 'OPERATOR' ? 'info' : 'neutral'
}

function relativeLogin(value: string | null) {
  if (!value) return 'Belum pernah'
  // Memakai waktu acuan bersama, bukan Date.now(), agar SSR & klien sepakat.
  const diff = now.value - new Date(value).getTime()
  const minutes = Math.round(diff / 60000)
  if (minutes < 1) return 'Baru saja'
  if (minutes < 60) return `${minutes} menit lalu`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} jam lalu`
  return new Date(value).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
}
</script>

<template>
  <div>
    <UiPageHeading
      title="Pengguna & Operator"
      icon="i-lucide-user-cog"
      description="Akun yang dapat masuk ke sistem. Operator hanya melihat antrean yang ditugaskan kepadanya."
    >
      <template #actions>
        <UInput v-model="search" icon="i-lucide-search" placeholder="Cari nama atau email…" class="w-56" />
        <UButton
          v-if="can(PERMISSIONS.USER_MANAGE)"
          icon="i-lucide-user-plus"
          label="Pengguna Baru"
          @click="openCreate"
        />
      </template>
    </UiPageHeading>

    <div class="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <table class="w-full text-sm">
        <thead class="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-800/50">
          <tr>
            <th class="px-4 py-3 font-medium">
              Pengguna
            </th>
            <th class="px-4 py-3 font-medium">
              Role
            </th>
            <th class="hidden px-4 py-3 font-medium lg:table-cell">
              Penugasan
            </th>
            <th class="hidden px-4 py-3 font-medium sm:table-cell">
              Login terakhir
            </th>
            <th class="px-4 py-3 font-medium">
              Status
            </th>
            <th class="w-12 px-4 py-3" />
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
          <tr v-if="pending && !users.length">
            <td colspan="6" class="px-4 py-8 text-center text-slate-500">
              Memuat…
            </td>
          </tr>
          <tr v-else-if="!users.length">
            <td colspan="6" class="px-4 py-10 text-center text-slate-500">
              Tidak ada pengguna yang cocok.
            </td>
          </tr>

          <tr v-for="user in users" :key="user.id" class="hover:bg-slate-50 dark:hover:bg-slate-800/40">
            <td class="px-4 py-3">
              <div class="flex items-center gap-3">
                <UAvatar :alt="user.name" size="sm" />
                <div class="min-w-0">
                  <p class="truncate font-medium">
                    {{ user.name }}
                    <span v-if="user.id === me?.user.id" class="ml-1 text-xs text-slate-400">(Anda)</span>
                  </p>
                  <p class="truncate text-xs text-slate-500">
                    {{ user.email }}
                  </p>
                </div>
              </div>
            </td>
            <td class="px-4 py-3">
              <UBadge
                v-for="role in user.roles"
                :key="role.id"
                size="sm"
                variant="subtle"
                :color="roleColor(role.key) as never"
                :label="role.name"
              />
            </td>
            <td class="hidden px-4 py-3 lg:table-cell">
              <div v-if="!user.placement" class="text-xs text-slate-400">
                —
              </div>
              <div v-else class="flex flex-wrap items-center gap-1">
                <span class="text-xs font-semibold">{{ user.placement.counter.name }}</span>
                <span
                  v-for="service in user.placement.services"
                  :key="service.id"
                  class="rounded px-1.5 py-0.5 text-xs font-medium"
                  :style="{ backgroundColor: service.color + '1a', color: readable(service.color) }"
                >{{ service.code }}</span>
                <span v-if="!user.placement.services.length" class="text-xs text-amber-600 dark:text-amber-400">
                  loket belum punya layanan
                </span>
              </div>
            </td>
            <td class="hidden px-4 py-3 text-slate-500 sm:table-cell">
              {{ relativeLogin(user.lastLoginAt) }}
            </td>
            <td class="px-4 py-3">
              <UBadge
                size="sm"
                variant="subtle"
                :color="user.isActive ? 'success' : 'neutral'"
                :label="user.isActive ? 'Aktif' : 'Nonaktif'"
              />
            </td>
            <td class="px-4 py-3">
              <UDropdownMenu
                v-if="can(PERMISSIONS.USER_MANAGE)"
                :items="[
                  [
                    { label: 'Ubah', icon: 'i-lucide-pencil', onSelect: () => openEdit(user) },
                    { label: 'Reset kata sandi', icon: 'i-lucide-key-round', onSelect: () => { passwordTarget = user; newPassword = '' } },
                  ],
                  user.id === me?.user.id
                    ? []
                    : [{ label: 'Hapus', icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: () => (deleteTarget = user) }],
                ]"
              >
                <UButton icon="i-lucide-ellipsis-vertical" aria-label="Menu tindakan" title="Menu tindakan" variant="ghost" color="neutral" size="xs" />
              </UDropdownMenu>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Modal form -->
    <UModal
      v-model:open="modalOpen"
      :title="editing ? 'Ubah Pengguna' : 'Pengguna Baru'"
      :description="editing ? 'Email tidak dapat diubah.' : 'Akun baru langsung dapat digunakan untuk masuk.'"
    >
      <template #body>
        <div class="space-y-4">
          <UFormField label="Nama Lengkap" required>
            <UInput v-model="form.name" class="w-full" placeholder="Budi Santoso" />
          </UFormField>

          <UFormField label="Email" required>
            <UInput v-model="form.email" type="email" class="w-full" :disabled="!!editing" placeholder="budi@instansi.go.id" />
          </UFormField>

          <UFormField v-if="!editing" label="Kata Sandi" required help="Minimal 8 karakter. Sampaikan ke pengguna dan minta segera diganti.">
            <UInput v-model="form.password" type="text" class="w-full" placeholder="••••••••" />
          </UFormField>

          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField label="Username" hint="opsional">
              <UInput v-model="form.username" class="w-full" placeholder="budi" />
            </UFormField>
            <UFormField label="Nomor HP" hint="opsional">
              <UInput v-model="form.phone" class="w-full" placeholder="0812…" />
            </UFormField>
          </div>

          <UFormField label="Role" required>
            <USelect v-model="form.roleId" :items="roleOptions" class="w-full" />
          </UFormField>

          <UCheckbox v-if="editing" v-model="form.isActive" label="Akun aktif" />
        </div>
      </template>

      <template #footer="{ close }">
        <div class="flex w-full justify-end gap-2">
          <UButton variant="ghost" color="neutral" label="Batal" @click="close" />
          <UButton
            :loading="saving"
            :disabled="form.name.length < 2 || (!editing && (form.email.length < 5 || form.password.length < 8)) || !form.roleId"
            icon="i-lucide-save"
            :label="editing ? 'Simpan' : 'Buat Pengguna'"
            @click="save"
          />
        </div>
      </template>
    </UModal>

    <!-- Reset kata sandi -->
    <UModal
      :open="!!passwordTarget"
      title="Reset kata sandi"
      :description="`Kata sandi baru untuk ${passwordTarget?.name}. Seluruh sesi aktifnya akan dicabut.`"
      @update:open="(v) => { if (!v) passwordTarget = null }"
    >
      <template #body>
        <UFormField label="Kata Sandi Baru" required help="Minimal 8 karakter">
          <UInput v-model="newPassword" class="w-full" placeholder="••••••••" />
        </UFormField>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton variant="ghost" color="neutral" label="Batal" @click="passwordTarget = null" />
          <UButton
            color="warning"
            :loading="resetting"
            :disabled="newPassword.length < 8"
            label="Reset"
            @click="resetPassword"
          />
        </div>
      </template>
    </UModal>

    <!-- Hapus -->
    <UModal
      :open="!!deleteTarget"
      title="Hapus pengguna?"
      :description="`Akun ${deleteTarget?.name} akan dinonaktifkan dan sesinya dicabut. Riwayat aktivitas tetap tersimpan.`"
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
