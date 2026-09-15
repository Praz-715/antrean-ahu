<script setup lang="ts">
import { apiFetch } from '../../composables/useApi'
import { PERMISSIONS } from '#shared/constants/permissions'
import { SELECT_NONE, nullableValue } from '#shared/constants/ui'

definePageMeta({ layout: 'admin', middleware: 'admin' })
useHead({ title: 'Form Builder' })

interface FieldRow {
  id?: string
  key: string
  label: string
  type: string
  placeholder: string | null
  helpText: string | null
  isRequired: boolean
  defaultValue: string | null
  options: Array<{ label: string, value: string }> | null
  validation: Record<string, unknown> | null
  autofillKey: string | null
}

interface FormRow {
  id: string
  name: string
  description: string | null
  isActive: boolean
  requireCaptcha: boolean
  dataSourceId: string | null
  fields: FieldRow[]
}

const FIELD_TYPES = [
  { value: 'TEXT', label: 'Teks', icon: 'i-lucide-type' },
  { value: 'TEXTAREA', label: 'Teks Panjang', icon: 'i-lucide-align-left' },
  { value: 'NUMBER', label: 'Angka', icon: 'i-lucide-hash' },
  { value: 'PHONE', label: 'Nomor HP', icon: 'i-lucide-phone' },
  { value: 'EMAIL', label: 'Email', icon: 'i-lucide-mail' },
  { value: 'DATE', label: 'Tanggal', icon: 'i-lucide-calendar' },
  { value: 'DATETIME', label: 'Tanggal & Jam', icon: 'i-lucide-calendar-clock' },
  { value: 'SELECT', label: 'Dropdown', icon: 'i-lucide-chevron-down-square' },
  { value: 'RADIO', label: 'Pilihan Tunggal', icon: 'i-lucide-circle-dot' },
  { value: 'CHECKBOX', label: 'Pilihan Ganda', icon: 'i-lucide-check-square' },
  { value: 'FILE', label: 'Unggah Berkas', icon: 'i-lucide-paperclip', unavailable: true },
  { value: 'HIDDEN', label: 'Tersembunyi', icon: 'i-lucide-eye-off' },
]

const NEEDS_OPTIONS = ['SELECT', 'RADIO', 'CHECKBOX']

const { can } = useMe()
const { call } = useApi()
const { currentId, loadEvents } = useCurrentEvent()
await loadEvents()

const forms = ref<FormRow[]>([])
const activeFormId = ref<string | null>(null)
const fields = ref<FieldRow[]>([])
const selectedIndex = ref<number | null>(null)
const pending = ref(false)
const dirty = ref(false)

const activeForm = computed(() => forms.value.find(f => f.id === activeFormId.value) ?? null)
const selected = computed(() => (selectedIndex.value === null ? null : fields.value[selectedIndex.value] ?? null))

async function load() {
  if (!currentId.value) { forms.value = []; return }
  pending.value = true
  try {
    forms.value = await apiFetch<FormRow[]>('/api/admin/forms', { query: { eventId: currentId.value } })
    if (!forms.value.some(f => f.id === activeFormId.value)) {
      activeFormId.value = forms.value.find(f => f.isActive)?.id ?? forms.value[0]?.id ?? null
    }
    syncFields()
  }
  finally { pending.value = false }
}

function syncFields() {
  fields.value = (activeForm.value?.fields ?? []).map(f => ({ ...f, options: (f.options as never) ?? null }))
  selectedIndex.value = fields.value.length ? 0 : null
  dirty.value = false
}

watch(currentId, load, { immediate: true })
watch(activeFormId, syncFields)

// ---- kelola formulir ----
const formModalOpen = ref(false)
const formMeta = reactive({ name: '', description: '' })
const savingForm = ref(false)

function openCreateForm() {
  Object.assign(formMeta, { name: '', description: '' })
  formModalOpen.value = true
}

async function createForm() {
  savingForm.value = true
  const res = await call<{ id: string }>(
    '/api/admin/forms',
    { method: 'POST', body: { eventId: currentId.value, name: formMeta.name, description: formMeta.description || null } },
    'Formulir dibuat',
  )
  savingForm.value = false
  if (res) {
    formModalOpen.value = false
    await load()
    activeFormId.value = res.id
  }
}

// ---- sambungan ke sumber data (§6) ----
interface DataSourceOption {
  id: string
  name: string
  isActive: boolean
  queryTemplate: { lookupFieldKey?: string | null } | null
}

const dataSources = ref<DataSourceOption[]>([])
const savingDataSource = ref(false)

/**
 * Daftar integrasi hanya dimuat bila pengguna memang boleh melihatnya. Pengelola
 * formulir belum tentu punya izin integrasi, dan gagal memuat di sini tidak boleh
 * mengganggu pekerjaan utamanya menyusun field.
 */
async function loadDataSources() {
  if (!can(PERMISSIONS.INTEGRATION_VIEW) && !can(PERMISSIONS.INTEGRATION_MANAGE)) return
  try {
    dataSources.value = await apiFetch<DataSourceOption[]>('/api/admin/data-sources')
  }
  catch {
    dataSources.value = []
  }
}
await loadDataSources()

const attachedSource = computed(() =>
  dataSources.value.find(d => d.id === activeForm.value?.dataSourceId) ?? null)

async function attachDataSource(dataSourceId: string | null) {
  if (!activeFormId.value) return
  savingDataSource.value = true
  await call(
    `/api/admin/forms/${activeFormId.value}`,
    { method: 'PATCH', body: { dataSourceId } },
    dataSourceId ? 'Sumber data disambungkan' : 'Sumber data dilepas',
  )
  savingDataSource.value = false
  await load()
}

/**
 * Captcha geser pada halaman publik (§36).
 *
 * Disimpan pada formulir, bukan pada halaman publiknya: yang dilindungi adalah
 * pengiriman isian, dan satu event bisa memakai formulir berbeda untuk keperluan
 * berbeda — pendaftaran umum boleh dijaga captcha, formulir internal tidak perlu.
 */
const savingCaptcha = ref(false)

async function setRequireCaptcha(requireCaptcha: boolean) {
  if (!activeFormId.value) return
  savingCaptcha.value = true
  await call(
    `/api/admin/forms/${activeFormId.value}`,
    { method: 'PATCH', body: { requireCaptcha } },
    requireCaptcha ? 'Verifikasi geser dinyalakan' : 'Verifikasi geser dimatikan',
  )
  savingCaptcha.value = false
  await load()
}

async function activateForm() {
  if (!activeFormId.value) return
  await call(`/api/admin/forms/${activeFormId.value}/activate`, { method: 'POST' }, 'Formulir diaktifkan')
  await load()
}

const deleteFormTarget = ref<FormRow | null>(null)
async function confirmDeleteForm() {
  if (!deleteFormTarget.value) return
  const res = await call(`/api/admin/forms/${deleteFormTarget.value.id}`, { method: 'DELETE' }, 'Formulir dihapus')
  deleteFormTarget.value = null
  if (res) { activeFormId.value = null; await load() }
}

// ---- kelola field ----
function slugKey(label: string) {
  const base = label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'field'
  let candidate = /^[a-z]/.test(base) ? base : `f_${base}`
  let n = 1
  while (fields.value.some(f => f.key === candidate)) candidate = `${base}_${++n}`
  return candidate
}

function addField(type: string) {
  const meta = FIELD_TYPES.find(t => t.value === type)!
  const label = meta.label
  fields.value.push({
    key: slugKey(label),
    label,
    type,
    placeholder: null,
    helpText: null,
    isRequired: false,
    defaultValue: null,
    options: NEEDS_OPTIONS.includes(type) ? [{ label: 'Opsi 1', value: 'opsi_1' }] : null,
    validation: null,
    autofillKey: null,
  })
  selectedIndex.value = fields.value.length - 1
  dirty.value = true
}

function removeField(index: number) {
  fields.value.splice(index, 1)
  selectedIndex.value = fields.value.length ? Math.min(index, fields.value.length - 1) : null
  dirty.value = true
}

function moveField(from: number, to: number) {
  if (to < 0 || to >= fields.value.length) return
  const [item] = fields.value.splice(from, 1)
  fields.value.splice(to, 0, item!)
  selectedIndex.value = to
  dirty.value = true
}

// drag & drop urutan field
const dragIndex = ref<number | null>(null)
function onDrop(index: number) {
  if (dragIndex.value === null || dragIndex.value === index) return
  moveField(dragIndex.value, index)
  dragIndex.value = null
}

function addOption() {
  if (!selected.value) return
  const list = selected.value.options ?? []
  list.push({ label: `Opsi ${list.length + 1}`, value: `opsi_${list.length + 1}` })
  selected.value.options = list
  dirty.value = true
}

function removeOption(i: number) {
  selected.value?.options?.splice(i, 1)
  dirty.value = true
}

const saving = ref(false)
async function saveFields() {
  if (!activeFormId.value) return
  saving.value = true
  const res = await call(
    `/api/admin/forms/${activeFormId.value}/fields`,
    { method: 'PUT', body: { fields: fields.value } },
    'Formulir disimpan',
  )
  saving.value = false
  if (res) { await load() }
}

function iconOf(type: string) {
  return FIELD_TYPES.find(t => t.value === type)?.icon ?? 'i-lucide-type'
}
</script>

<template>
  <div>
    <UiPageHeading
      title="Form Builder"
      icon="i-lucide-clipboard-list"
      description="Susun sendiri data yang harus diisi pengunjung sebelum mengambil nomor. Hanya satu formulir aktif per event."
    >
      <template #actions>
        <UiEventPicker />
        <UButton
          v-if="can(PERMISSIONS.FORM_MANAGE)"
          icon="i-lucide-plus"
          variant="outline"
          color="neutral"
          label="Formulir Baru"
          :disabled="!currentId"
          @click="openCreateForm"
        />
        <UButton
          v-if="can(PERMISSIONS.FORM_MANAGE) && activeForm"
          icon="i-lucide-save"
          label="Simpan"
          :loading="saving"
          :disabled="!dirty && !!activeForm.fields.length"
          @click="saveFields"
        />
      </template>
    </UiPageHeading>

    <div v-if="!forms.length" class="rounded-xl border border-dashed border-slate-300 py-16 text-center dark:border-slate-700">
      <UIcon name="i-lucide-clipboard-list" class="mx-auto size-10 text-slate-400" />
      <p class="mt-3 font-medium">
        Belum ada formulir
      </p>
      <p class="mx-auto mt-1 max-w-md text-sm text-slate-500">
        Buat formulir, tambahkan field, lalu aktifkan agar dipakai halaman publik.
      </p>
      <UButton
        v-if="can(PERMISSIONS.FORM_MANAGE)"
        class="mt-4"
        icon="i-lucide-plus"
        label="Buat Formulir"
        :disabled="!currentId"
        @click="openCreateForm"
      />
    </div>

    <template v-else>
      <!-- Pilih formulir -->
      <div class="mb-4 flex flex-wrap items-center gap-2">
        <button
          v-for="f in forms"
          :key="f.id"
          type="button"
          class="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
          :class="f.id === activeFormId
            ? 'bg-brand-600 text-white'
            : 'bg-white text-slate-600 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-800'"
          @click="activeFormId = f.id"
        >
          {{ f.name }}
          <UBadge v-if="f.isActive" size="sm" color="success" variant="solid" label="Aktif" />
        </button>

        <div class="ml-auto flex gap-2">
          <UiActionButton
            v-if="can(PERMISSIONS.FORM_MANAGE) && activeForm && !activeForm.isActive"
            size="sm"
            variant="soft"
            color="success"
            icon="i-lucide-check-circle"
            label="Aktifkan"
            :action="activateForm"
          />
          <UButton
            v-if="can(PERMISSIONS.FORM_MANAGE) && activeForm && !activeForm.isActive"
            size="sm"
            variant="ghost"
            color="error"
            icon="i-lucide-trash-2"
            aria-label="Hapus formulir"
            title="Hapus formulir"
            @click="deleteFormTarget = activeForm"
          />
        </div>
      </div>

      <!-- Isi otomatis dari sistem eksternal (§6) -->
      <div
        v-if="activeForm && (can(PERMISSIONS.INTEGRATION_VIEW) || can(PERMISSIONS.INTEGRATION_MANAGE))"
        class="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
      >
        <UIcon name="i-lucide-plug" class="size-5 text-slate-400" />
        <div class="min-w-48 flex-1">
          <p class="text-sm font-medium">
            Isi otomatis dari sumber data
          </p>
          <p class="text-xs text-slate-500">
            <template v-if="attachedSource">
              Field pemicu:
              <span class="font-mono">{{ attachedSource.queryTemplate?.lookupFieldKey || 'belum diatur di halaman Integrasi' }}</span>
            </template>
            <template v-else>
              Pilih integrasi agar sebagian isian terisi sendiri setelah pengunjung mengetik satu nilai.
            </template>
          </p>
        </div>

        <USelect
          class="w-full sm:w-64"
          :model-value="activeForm.dataSourceId ?? SELECT_NONE"
          :disabled="!can(PERMISSIONS.FORM_MANAGE) || savingDataSource"
          :items="[
            { label: 'Tidak dipakai', value: SELECT_NONE },
            ...dataSources.map(d => ({ label: d.isActive ? d.name : `${d.name} (nonaktif)`, value: d.id })),
          ]"
          @update:model-value="(v: string) => attachDataSource(nullableValue(v))"
        />
      </div>

      <!-- Verifikasi anti-bot pada halaman publik (§36) -->
      <div
        v-if="activeForm"
        class="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
      >
        <UIcon name="i-lucide-shield-check" class="size-5 text-slate-400" />
        <div class="min-w-48 flex-1">
          <p class="text-sm font-medium">
            Verifikasi geser sebelum ambil nomor
          </p>
          <p class="text-xs text-slate-500">
            Pengunjung menggeser potongan gambar sampai pas setelah menekan "Ambil Nomor Antrean".
            Menahan pengambilan nomor secara borongan tanpa perlu layanan dari luar.
            <template v-if="!activeForm.isActive">
              Baru berlaku setelah formulir ini diaktifkan.
            </template>
          </p>
        </div>

        <USwitch
          :model-value="activeForm.requireCaptcha"
          :disabled="!can(PERMISSIONS.FORM_MANAGE) || savingCaptcha"
          :label="activeForm.requireCaptcha ? 'Aktif' : 'Nonaktif'"
          @update:model-value="(v: boolean) => setRequireCaptcha(v)"
        />
      </div>

      <div class="grid gap-4 lg:grid-cols-12">
        <!-- Palet field -->
        <div class="lg:col-span-3">
          <div class="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <h2 class="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Tambah Field
            </h2>
            <div class="grid grid-cols-2 gap-2 lg:grid-cols-1">
              <button
                v-for="type in FIELD_TYPES"
                :key="type.value"
                type="button"
                :disabled="!can(PERMISSIONS.FORM_MANAGE) || type.unavailable"
                :title="type.unavailable ? 'Menunggu media library (Phase 5)' : undefined"
                class="flex items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-2 text-left text-sm transition-colors hover:border-brand-400 hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-slate-200 disabled:hover:bg-transparent dark:border-slate-800 dark:hover:bg-slate-800"
                @click="addField(type.value)"
              >
                <UIcon :name="type.icon" class="size-4 shrink-0 text-slate-400" />
                <span class="truncate">{{ type.label }}</span>
                <UIcon v-if="type.unavailable" name="i-lucide-lock" class="ml-auto size-3 shrink-0 text-slate-400" />
              </button>
            </div>
          </div>
        </div>

        <!-- Kanvas field -->
        <div class="lg:col-span-5">
          <div class="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <h2 class="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Susunan Field · {{ fields.length }}
            </h2>

            <div v-if="!fields.length" class="rounded-lg border border-dashed border-slate-300 py-10 text-center text-sm text-slate-500 dark:border-slate-700">
              Belum ada field. Pilih tipe di sebelah kiri untuk menambah.
            </div>

            <ul v-else class="space-y-2">
              <li
                v-for="(field, index) in fields"
                :key="index"
                draggable="true"
                class="flex cursor-grab items-center gap-2 rounded-lg border p-2.5 transition-colors active:cursor-grabbing"
                :class="index === selectedIndex
                  ? 'border-brand-500 bg-brand-50 dark:bg-brand-950/40'
                  : 'border-slate-200 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50'"
                @click="selectedIndex = index"
                @dragstart="dragIndex = index"
                @dragover.prevent
                @drop="onDrop(index)"
              >
                <UIcon name="i-lucide-grip-vertical" class="size-4 shrink-0 text-slate-300" />
                <UIcon :name="iconOf(field.type)" class="size-4 shrink-0 text-slate-400" />
                <div class="min-w-0 flex-1">
                  <p class="truncate text-sm font-medium">
                    {{ field.label }}
                    <span v-if="field.isRequired" class="text-rose-500">*</span>
                  </p>
                  <p class="truncate font-mono text-xs text-slate-400">
                    {{ field.key }}
                  </p>
                </div>
                <div class="flex shrink-0 gap-0.5">
                  <UButton icon="i-lucide-chevron-up" aria-label="Naikkan urutan field" title="Naikkan urutan field" size="xs" variant="ghost" color="neutral" @click.stop="moveField(index, index - 1)" />
                  <UButton icon="i-lucide-chevron-down" aria-label="Turunkan urutan field" title="Turunkan urutan field" size="xs" variant="ghost" color="neutral" @click.stop="moveField(index, index + 1)" />
                  <UButton icon="i-lucide-trash-2" aria-label="Hapus field" title="Hapus field" size="xs" variant="ghost" color="error" @click.stop="removeField(index)" />
                </div>
              </li>
            </ul>
          </div>
        </div>

        <!-- Properti field -->
        <div class="lg:col-span-4">
          <div class="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <h2 class="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Properti Field
            </h2>

            <div v-if="!selected" class="py-10 text-center text-sm text-slate-500">
              Pilih salah satu field untuk mengatur propertinya.
            </div>

            <div v-else class="space-y-3" @input="dirty = true" @change="dirty = true">
              <UFormField label="Label" required>
                <UInput v-model="selected.label" class="w-full" />
              </UFormField>

              <UFormField label="Key" help="Dipakai di API dan laporan. Huruf kecil, angka, garis bawah.">
                <UInput v-model="selected.key" class="w-full font-mono" />
              </UFormField>

              <UFormField label="Tipe">
                <USelect
                  v-model="selected.type"
                  :items="FIELD_TYPES.map(t => ({ label: t.label, value: t.value }))"
                  class="w-full"
                />
              </UFormField>

              <UFormField label="Placeholder">
                <UInput v-model="selected.placeholder as string" class="w-full" />
              </UFormField>

              <UFormField label="Teks Bantuan">
                <UInput v-model="selected.helpText as string" class="w-full" />
              </UFormField>

              <UFormField v-if="!NEEDS_OPTIONS.includes(selected.type)" label="Nilai Bawaan">
                <UInput v-model="selected.defaultValue as string" class="w-full" />
              </UFormField>

              <UFormField
                label="Kunci Autofill"
                help="Diisi otomatis dari data source eksternal, mis. nomor rekam medis."
              >
                <UInput v-model="selected.autofillKey as string" class="w-full font-mono" placeholder="kosongkan bila tidak dipakai" />
              </UFormField>

              <UCheckbox v-model="selected.isRequired" label="Wajib diisi" @update:model-value="dirty = true" />

              <!-- Opsi -->
              <div v-if="NEEDS_OPTIONS.includes(selected.type)" class="rounded-lg bg-slate-50 p-3 dark:bg-slate-800/50">
                <div class="mb-2 flex items-center justify-between">
                  <span class="text-xs font-semibold uppercase tracking-wide text-slate-500">Opsi</span>
                  <UButton size="xs" variant="ghost" icon="i-lucide-plus" label="Tambah" @click="addOption" />
                </div>
                <div v-for="(opt, i) in selected.options ?? []" :key="i" class="mb-2 flex gap-2">
                  <UInput v-model="opt.label" size="sm" placeholder="Label" class="flex-1" />
                  <UInput v-model="opt.value" size="sm" placeholder="value" class="w-28 font-mono" />
                  <UButton size="xs" variant="ghost" color="error" icon="i-lucide-x" aria-label="Hapus pilihan" title="Hapus pilihan" @click="removeOption(i)" />
                </div>
              </div>
            </div>
          </div>

          <!-- Pratinjau -->
          <div v-if="fields.length" class="mt-4 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <h2 class="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Pratinjau Pengunjung
            </h2>
            <div class="space-y-3">
              <div v-for="field in fields" :key="field.key">
                <label class="mb-1 block text-sm font-medium">
                  {{ field.label }}
                  <span v-if="field.isRequired" class="text-rose-500">*</span>
                </label>
                <div class="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-400 dark:border-slate-700">
                  {{ field.placeholder || (NEEDS_OPTIONS.includes(field.type) ? 'Pilih…' : 'Isian pengunjung') }}
                </div>
                <p v-if="field.helpText" class="mt-1 text-xs text-slate-400">
                  {{ field.helpText }}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>

    <UModal v-model:open="formModalOpen" title="Formulir Baru" description="Formulir baru dibuat sebagai draf; aktifkan bila sudah siap.">
      <template #body>
        <div class="space-y-4">
          <UFormField label="Nama Formulir" required>
            <UInput v-model="formMeta.name" class="w-full" placeholder="Form Pendaftaran Pasien" />
          </UFormField>
          <UFormField label="Deskripsi">
            <UTextarea v-model="formMeta.description" :rows="2" class="w-full" />
          </UFormField>
        </div>
      </template>
      <template #footer="{ close }">
        <div class="flex w-full justify-end gap-2">
          <UButton variant="ghost" color="neutral" label="Batal" @click="close" />
          <UButton :loading="savingForm" :disabled="formMeta.name.trim().length < 2" label="Buat" @click="createForm" />
        </div>
      </template>
    </UModal>

    <UModal
      :open="!!deleteFormTarget"
      title="Hapus formulir?"
      :description="`&quot;${deleteFormTarget?.name}&quot; beserta seluruh field-nya akan dihapus.`"
      @update:open="(v) => { if (!v) deleteFormTarget = null }"
    >
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton variant="ghost" color="neutral" label="Batal" @click="deleteFormTarget = null" />
          <UiActionButton color="error" icon="i-lucide-trash-2" label="Hapus" :action="confirmDeleteForm" />
        </div>
      </template>
    </UModal>
  </div>
</template>
