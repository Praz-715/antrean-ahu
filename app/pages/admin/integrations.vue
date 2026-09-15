<script setup lang="ts">
import { apiFetch } from '../../composables/useApi'
import { PERMISSIONS } from '#shared/constants/permissions'
import {
  DATA_SOURCE_AUTH_TYPES,
  HTTP_METHODS,
  IMPLEMENTED_DATA_SOURCE_TYPES,
  TRANSFORMS,
} from '#shared/schemas/data-source'

definePageMeta({ layout: 'admin', middleware: 'admin' })
useHead({ title: 'Integrasi' })

interface Mapping {
  id?: string
  sourcePath: string
  targetFieldKey: string
  transform: string | null
}

interface DataSource {
  id: string
  name: string
  type: string
  baseUrl: string
  httpMethod: string
  authType: string
  hasCredentials: boolean
  headers: Record<string, string>
  queryTemplate: { lookupFieldKey?: string | null, query?: Record<string, string>, body?: Record<string, string>, rootPath?: string | null }
  timeoutMs: number
  isActive: boolean
  mappings: Mapping[]
  _count: { formDefinitions: number }
}

interface TestResult {
  ok: boolean
  status: number
  durationMs: number
  addresses: string[]
  truncated: boolean
  preview: string
  mapped: Record<string, string | number | boolean>
  unmappedPaths: string[]
  error?: string
}

const { can } = useMe()
const { call } = useApi()

const items = ref<DataSource[]>([])
const pending = ref(false)
const canManage = computed(() => can(PERMISSIONS.INTEGRATION_MANAGE))

async function load() {
  pending.value = true
  try {
    items.value = await apiFetch<DataSource[]>('/api/admin/data-sources')
  }
  finally { pending.value = false }
}
await load()

// ---- formulir ----
type Pair = { key: string, value: string }

const modalOpen = ref(false)
const editing = ref<DataSource | null>(null)
const saving = ref(false)
const replaceCredentials = ref(true)

const form = reactive({
  name: '',
  type: 'REST' as string,
  baseUrl: '',
  httpMethod: 'GET' as string,
  authType: 'NONE' as string,
  timeoutMs: 5000,
  isActive: true,
  lookupFieldKey: '',
  rootPath: '',
  apiKeyIn: 'header' as 'header' | 'query',
  apiKeyName: 'X-API-Key',
  apiKeyValue: '',
  bearerToken: '',
  basicUsername: '',
  basicPassword: '',
})

const headerPairs = ref<Pair[]>([])
const queryPairs = ref<Pair[]>([])
const mappings = ref<Mapping[]>([])

function toPairs(record: Record<string, string> | undefined): Pair[] {
  return Object.entries(record ?? {}).map(([key, value]) => ({ key, value }))
}

function fromPairs(pairs: Pair[]): Record<string, string> {
  return Object.fromEntries(pairs.filter(p => p.key.trim()).map(p => [p.key.trim(), p.value]))
}

function openCreate() {
  editing.value = null
  replaceCredentials.value = true
  Object.assign(form, {
    name: '',
    type: 'REST',
    baseUrl: '',
    httpMethod: 'GET',
    authType: 'NONE',
    timeoutMs: 5000,
    isActive: true,
    lookupFieldKey: '',
    rootPath: '',
    apiKeyIn: 'header',
    apiKeyName: 'X-API-Key',
    apiKeyValue: '',
    bearerToken: '',
    basicUsername: '',
    basicPassword: '',
  })
  headerPairs.value = []
  queryPairs.value = []
  mappings.value = []
  testResult.value = null
  modalOpen.value = true
}

function openEdit(item: DataSource) {
  editing.value = item
  // Kredensial tidak pernah dikirim ke klien; biarkan yang tersimpan apa adanya
  // kecuali admin memang memilih menggantinya.
  replaceCredentials.value = !item.hasCredentials
  Object.assign(form, {
    name: item.name,
    type: item.type,
    baseUrl: item.baseUrl,
    httpMethod: item.httpMethod,
    authType: item.authType,
    timeoutMs: item.timeoutMs,
    isActive: item.isActive,
    lookupFieldKey: item.queryTemplate?.lookupFieldKey ?? '',
    rootPath: item.queryTemplate?.rootPath ?? '',
    apiKeyIn: 'header',
    apiKeyName: 'X-API-Key',
    apiKeyValue: '',
    bearerToken: '',
    basicUsername: '',
    basicPassword: '',
  })
  headerPairs.value = toPairs(item.headers)
  queryPairs.value = toPairs(item.queryTemplate?.query)
  mappings.value = item.mappings.map(m => ({ ...m, transform: m.transform ?? 'none' }))
  testResult.value = null
  modalOpen.value = true
}

function credentialsPayload() {
  if (!replaceCredentials.value) return undefined
  switch (form.authType) {
    case 'API_KEY':
      return { authType: 'API_KEY', in: form.apiKeyIn, name: form.apiKeyName, value: form.apiKeyValue }
    case 'BEARER':
      return { authType: 'BEARER', token: form.bearerToken }
    case 'BASIC':
      return { authType: 'BASIC', username: form.basicUsername, password: form.basicPassword }
    default:
      return null
  }
}

function buildBody() {
  return {
    name: form.name,
    type: form.type,
    baseUrl: form.baseUrl,
    httpMethod: form.httpMethod,
    authType: form.authType,
    credentials: credentialsPayload(),
    headers: fromPairs(headerPairs.value),
    queryTemplate: {
      lookupFieldKey: form.lookupFieldKey.trim() || null,
      rootPath: form.rootPath.trim() || null,
      query: fromPairs(queryPairs.value),
      body: {},
    },
    timeoutMs: Number(form.timeoutMs),
    isActive: form.isActive,
    mappings: mappings.value
      .filter(m => m.sourcePath.trim() && m.targetFieldKey.trim())
      .map(m => ({
        sourcePath: m.sourcePath.trim(),
        targetFieldKey: m.targetFieldKey.trim(),
        transform: m.transform ?? 'none',
      })),
  }
}

async function save() {
  saving.value = true
  const body = buildBody()
  const res = editing.value
    ? await call(`/api/admin/data-sources/${editing.value.id}`, { method: 'PATCH', body }, 'Sumber data diperbarui')
    : await call('/api/admin/data-sources', { method: 'POST', body }, 'Sumber data dibuat')
  saving.value = false
  if (res) { modalOpen.value = false; await load() }
}

async function toggleActive(item: DataSource) {
  await call(`/api/admin/data-sources/${item.id}`, { method: 'PATCH', body: { isActive: !item.isActive } })
  await load()
}

const deleteTarget = ref<DataSource | null>(null)
async function confirmDelete() {
  if (!deleteTarget.value) return
  const res = await call(`/api/admin/data-sources/${deleteTarget.value.id}`, { method: 'DELETE' }, 'Sumber data dihapus')
  deleteTarget.value = null
  if (res) await load()
}

// ---- uji koneksi ----
const testLookup = ref('')
const testResult = ref<TestResult | null>(null)

async function runTest(item: DataSource) {
  // Uji koneksi memakai konfigurasi TERSIMPAN, jadi simpan dulu bila ada perubahan.
  const res = await call<TestResult>(
    `/api/admin/data-sources/${item.id}/test`,
    { method: 'POST', body: { lookup: testLookup.value } },
  )
  if (res) testResult.value = res
}

const authLabel: Record<string, string> = {
  NONE: 'Tanpa autentikasi',
  API_KEY: 'API Key',
  BEARER: 'Bearer Token',
  BASIC: 'Basic Auth',
}
</script>

<template>
  <div>
    <UiPageHeading
      title="Integrasi Sumber Data"
      icon="i-lucide-plug"
      description="Ambil data dari sistem lain untuk mengisi formulir pengunjung secara otomatis. Kredensial disimpan terenkripsi dan tidak pernah ditampilkan kembali."
    >
      <template #actions>
        <UButton v-if="canManage" icon="i-lucide-plus" label="Sumber Data Baru" @click="openCreate" />
      </template>
    </UiPageHeading>

    <UAlert
      class="mb-4"
      color="neutral"
      variant="soft"
      icon="i-lucide-shield-check"
      title="Permintaan keluar dijaga"
      description="Server menolak URL yang mengarah ke jaringan internal, tidak mengikuti redirect, dan memutus permintaan yang melewati batas waktu. Pengunjung hanya menerima nilai yang dipetakan ke field formulir — bukan respons mentah."
    />

    <div v-if="pending && !items.length" class="space-y-3">
      <USkeleton v-for="i in 2" :key="i" class="h-32 w-full" />
    </div>

    <div
      v-else-if="!items.length"
      class="rounded-xl border border-dashed border-slate-300 py-16 text-center dark:border-slate-700"
    >
      <UIcon name="i-lucide-plug-zap" class="mx-auto size-10 text-slate-400" />
      <p class="mt-3 font-medium">
        Belum ada sumber data
      </p>
      <p class="mx-auto mt-1 max-w-md text-sm text-slate-500">
        Contoh: pengunjung mengetik nomor rekam medis, lalu nama dan tanggal lahirnya terisi sendiri dari sistem rumah sakit.
      </p>
      <UButton v-if="canManage" class="mt-4" icon="i-lucide-plus" label="Buat Sumber Data" @click="openCreate" />
    </div>

    <div v-else class="space-y-3">
      <article
        v-for="item in items"
        :key="item.id"
        class="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
        :class="{ 'opacity-60': !item.isActive }"
      >
        <div class="flex flex-wrap items-start gap-4">
          <div class="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-950 dark:text-brand-300">
            <UIcon name="i-lucide-plug" class="size-5" />
          </div>

          <div class="min-w-56 flex-1">
            <p class="flex flex-wrap items-center gap-2 font-semibold">
              {{ item.name }}
              <UBadge size="sm" variant="subtle" color="neutral" :label="item.type" />
              <UBadge size="sm" variant="subtle" :color="item.isActive ? 'success' : 'neutral'" :label="item.isActive ? 'Aktif' : 'Nonaktif'" />
            </p>
            <p class="mt-1 break-all font-mono text-xs text-slate-500">
              {{ item.httpMethod }} {{ item.baseUrl }}
            </p>
            <p class="mt-1 text-xs text-slate-400">
              {{ authLabel[item.authType] ?? item.authType }}
              <template v-if="item.hasCredentials"> · kredensial tersimpan</template>
              · {{ item.mappings.length }} pemetaan
              · batas waktu {{ item.timeoutMs }} ms
              <template v-if="item._count.formDefinitions"> · dipakai {{ item._count.formDefinitions }} formulir</template>
            </p>
          </div>

          <UDropdownMenu
            v-if="canManage"
            :items="[
              [
                { label: 'Ubah', icon: 'i-lucide-pencil', onSelect: () => openEdit(item) },
                { label: item.isActive ? 'Nonaktifkan' : 'Aktifkan', icon: item.isActive ? 'i-lucide-power-off' : 'i-lucide-power', onSelect: () => toggleActive(item) },
              ],
              [{ label: 'Hapus', icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: () => (deleteTarget = item) }],
            ]"
          >
            <UButton icon="i-lucide-ellipsis-vertical" aria-label="Menu tindakan" title="Menu tindakan" variant="ghost" color="neutral" size="xs" />
          </UDropdownMenu>
        </div>

        <!-- Uji koneksi cepat -->
        <div v-if="canManage" class="mt-3 flex flex-wrap items-end gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
          <UFormField label="Nilai uji untuk {lookup}" size="sm" class="min-w-48 flex-1">
            <UInput v-model="testLookup" class="w-full" placeholder="mis. 0012345" />
          </UFormField>
          <UiActionButton
            size="sm"
            variant="outline"
            color="neutral"
            icon="i-lucide-activity"
            label="Uji Koneksi"
            :action="() => runTest(item)"
          />
        </div>
      </article>
    </div>

    <!-- Hasil uji -->
    <div
      v-if="testResult"
      class="mt-4 rounded-xl border p-4"
      :class="testResult.ok
        ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/30'
        : 'border-rose-300 bg-rose-50 dark:border-rose-900 dark:bg-rose-950/30'"
    >
      <div class="flex flex-wrap items-center gap-3">
        <UIcon
          :name="testResult.ok ? 'i-lucide-check-circle' : 'i-lucide-x-circle'"
          class="size-5"
          :class="testResult.ok ? 'text-emerald-600' : 'text-rose-600'"
        />
        <p class="font-semibold">
          {{ testResult.ok ? 'Koneksi berhasil' : 'Koneksi gagal' }}
        </p>
        <span class="text-sm text-slate-500">
          HTTP {{ testResult.status || '—' }} · {{ testResult.durationMs }} ms
          <template v-if="testResult.addresses.length"> · {{ testResult.addresses.join(', ') }}</template>
        </span>
        <UButton class="ml-auto" size="xs" variant="ghost" color="neutral" icon="i-lucide-x" aria-label="Tutup hasil uji" title="Tutup hasil uji" @click="testResult = null" />
      </div>

      <p v-if="testResult.error" class="mt-2 text-sm text-rose-700 dark:text-rose-300">
        {{ testResult.error }}
      </p>

      <div v-if="Object.keys(testResult.mapped).length" class="mt-3">
        <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Hasil pemetaan
        </p>
        <dl class="mt-1 grid gap-1 text-sm sm:grid-cols-2">
          <div v-for="(value, key) in testResult.mapped" :key="key" class="flex gap-2">
            <dt class="font-mono text-slate-500">
              {{ key }}
            </dt>
            <dd class="font-medium">
              {{ value }}
            </dd>
          </div>
        </dl>
      </div>

      <p v-if="testResult.unmappedPaths.length" class="mt-2 text-sm text-amber-700 dark:text-amber-300">
        Path tanpa nilai: {{ testResult.unmappedPaths.join(', ') }}
      </p>

      <details v-if="testResult.preview" class="mt-3">
        <summary class="cursor-pointer text-sm text-slate-500">
          Lihat respons mentah
        </summary>
        <pre class="mt-2 max-h-64 overflow-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-200">{{ testResult.preview }}</pre>
      </details>
    </div>

    <!-- Formulir sumber data -->
    <UModal
      v-model:open="modalOpen"
      :title="editing ? 'Ubah Sumber Data' : 'Sumber Data Baru'"
      description="Gunakan {lookup} pada URL atau parameter untuk menandai posisi nilai yang diketik pengunjung."
      :ui="{ content: 'max-w-3xl' }"
    >
      <template #body>
        <div class="space-y-5">
          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField label="Nama" required>
              <UInput v-model="form.name" class="w-full" placeholder="SIMRS Pasien" />
            </UFormField>
            <UFormField label="Jenis">
              <USelect
                v-model="form.type"
                class="w-full"
                :items="IMPLEMENTED_DATA_SOURCE_TYPES.map(t => ({ label: t, value: t as string }))"
              />
            </UFormField>
          </div>

          <UFormField label="URL" required help="Contoh: https://simrs.contoh.id/api/patient/{lookup}">
            <UInput v-model="form.baseUrl" class="w-full font-mono text-sm" placeholder="https://.../api/patient/{lookup}" />
          </UFormField>

          <div class="grid gap-4 sm:grid-cols-3">
            <UFormField label="Metode">
              <USelect v-model="form.httpMethod" class="w-full" :items="HTTP_METHODS.map(m => ({ label: m, value: m as string }))" />
            </UFormField>
            <UFormField label="Batas waktu" help="milidetik">
              <UInputNumber v-model="form.timeoutMs" :min="500" :max="30000" :step="500" class="w-full" />
            </UFormField>
            <UFormField label="Status">
              <USwitch v-model="form.isActive" :label="form.isActive ? 'Aktif' : 'Nonaktif'" />
            </UFormField>
          </div>

          <!-- Autentikasi -->
          <div class="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
            <UFormField label="Autentikasi">
              <USelect
                v-model="form.authType"
                class="w-full sm:w-64"
                :items="DATA_SOURCE_AUTH_TYPES.map(a => ({ label: authLabel[a] ?? a, value: a as string }))"
              />
            </UFormField>

            <div v-if="form.authType !== 'NONE'" class="mt-3">
              <div v-if="editing?.hasCredentials && !replaceCredentials" class="flex flex-wrap items-center gap-3 rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-800/60">
                <UIcon name="i-lucide-lock" class="size-4 text-slate-500" />
                <span class="text-slate-600 dark:text-slate-300">Kredensial tersimpan dan tidak ditampilkan.</span>
                <UButton size="xs" variant="outline" color="neutral" label="Ganti kredensial" @click="replaceCredentials = true" />
              </div>

              <div v-else class="space-y-3">
                <template v-if="form.authType === 'API_KEY'">
                  <div class="grid gap-3 sm:grid-cols-3">
                    <UFormField label="Dikirim sebagai">
                      <USelect
                        v-model="form.apiKeyIn"
                        class="w-full"
                        :items="[{ label: 'Header', value: 'header' }, { label: 'Query', value: 'query' }]"
                      />
                    </UFormField>
                    <UFormField label="Nama">
                      <UInput v-model="form.apiKeyName" class="w-full" placeholder="X-API-Key" />
                    </UFormField>
                    <UFormField label="Nilai">
                      <UInput v-model="form.apiKeyValue" type="password" class="w-full" placeholder="••••••" />
                    </UFormField>
                  </div>
                </template>

                <UFormField v-else-if="form.authType === 'BEARER'" label="Token">
                  <UInput v-model="form.bearerToken" type="password" class="w-full" placeholder="••••••" />
                </UFormField>

                <div v-else-if="form.authType === 'BASIC'" class="grid gap-3 sm:grid-cols-2">
                  <UFormField label="Username">
                    <UInput v-model="form.basicUsername" class="w-full" />
                  </UFormField>
                  <UFormField label="Password">
                    <UInput v-model="form.basicPassword" type="password" class="w-full" />
                  </UFormField>
                </div>

                <UButton
                  v-if="editing?.hasCredentials"
                  size="xs"
                  variant="ghost"
                  color="neutral"
                  label="Batal ganti — pakai kredensial lama"
                  @click="replaceCredentials = false"
                />
              </div>
            </div>
          </div>

          <!-- Header & query tambahan -->
          <div class="grid gap-4 lg:grid-cols-2">
            <div>
              <div class="mb-2 flex items-center justify-between">
                <p class="text-sm font-medium">
                  Header tambahan
                </p>
                <UButton size="xs" variant="ghost" icon="i-lucide-plus" label="Tambah" @click="headerPairs.push({ key: '', value: '' })" />
              </div>
              <div v-if="!headerPairs.length" class="rounded-lg border border-dashed border-slate-300 p-3 text-center text-xs text-slate-400 dark:border-slate-700">
                Tidak ada
              </div>
              <div v-for="(pair, index) in headerPairs" :key="index" class="mb-2 flex gap-2">
                <UInput v-model="pair.key" class="flex-1" placeholder="Nama" size="sm" />
                <UInput v-model="pair.value" class="flex-1" placeholder="Nilai" size="sm" />
                <UButton size="xs" variant="ghost" color="error" icon="i-lucide-x" aria-label="Hapus header" title="Hapus header" @click="headerPairs.splice(index, 1)" />
              </div>
            </div>

            <div>
              <div class="mb-2 flex items-center justify-between">
                <p class="text-sm font-medium">
                  Parameter query
                </p>
                <UButton size="xs" variant="ghost" icon="i-lucide-plus" label="Tambah" @click="queryPairs.push({ key: '', value: '' })" />
              </div>
              <div v-if="!queryPairs.length" class="rounded-lg border border-dashed border-slate-300 p-3 text-center text-xs text-slate-400 dark:border-slate-700">
                Tidak ada
              </div>
              <div v-for="(pair, index) in queryPairs" :key="index" class="mb-2 flex gap-2">
                <UInput v-model="pair.key" class="flex-1" placeholder="nama" size="sm" />
                <UInput v-model="pair.value" class="flex-1" placeholder="{lookup}" size="sm" />
                <UButton size="xs" variant="ghost" color="error" icon="i-lucide-x" aria-label="Hapus parameter" title="Hapus parameter" @click="queryPairs.splice(index, 1)" />
              </div>
            </div>
          </div>

          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField label="Field pemicu di formulir" help="Kunci field yang memunculkan tombol Cari Data, mis. no_rm">
              <UInput v-model="form.lookupFieldKey" class="w-full font-mono text-sm" placeholder="no_rm" />
            </UFormField>
            <UFormField label="Path akar respons" help="Kosongkan bila data berada di akar JSON. Contoh: data.patient">
              <UInput v-model="form.rootPath" class="w-full font-mono text-sm" placeholder="data" />
            </UFormField>
          </div>

          <!-- Pemetaan -->
          <div>
            <div class="mb-2 flex items-center justify-between">
              <div>
                <p class="text-sm font-medium">
                  Pemetaan respons → field formulir
                </p>
                <p class="text-xs text-slate-500">
                  Hanya field yang dipetakan di sini yang boleh terisi otomatis.
                </p>
              </div>
              <UButton size="xs" variant="ghost" icon="i-lucide-plus" label="Tambah" @click="mappings.push({ sourcePath: '', targetFieldKey: '', transform: 'none' })" />
            </div>

            <div v-if="!mappings.length" class="rounded-lg border border-dashed border-slate-300 p-4 text-center text-sm text-slate-400 dark:border-slate-700">
              Belum ada pemetaan — autofill tidak akan mengisi apa pun.
            </div>

            <div v-for="(mapping, index) in mappings" :key="index" class="mb-2 grid gap-2 sm:grid-cols-[1fr_1fr_auto_auto]">
              <UInput v-model="mapping.sourcePath" size="sm" class="font-mono text-sm" placeholder="patient.name" />
              <UInput v-model="mapping.targetFieldKey" size="sm" class="font-mono text-sm" placeholder="nama_lengkap" />
              <USelect
                :model-value="mapping.transform ?? 'none'"
                size="sm"
                class="w-32"
                :items="TRANSFORMS.map(t => ({ label: t, value: t as string }))"
                @update:model-value="(v: string) => (mapping.transform = v)"
              />
              <UButton size="xs" variant="ghost" color="error" icon="i-lucide-x" aria-label="Hapus pemetaan" title="Hapus pemetaan" @click="mappings.splice(index, 1)" />
            </div>
          </div>
        </div>
      </template>

      <template #footer="{ close }">
        <div class="flex w-full justify-end gap-2">
          <UButton variant="ghost" color="neutral" label="Batal" @click="close" />
          <UButton
            :loading="saving"
            :disabled="form.name.trim().length < 2 || !form.baseUrl.trim()"
            icon="i-lucide-save"
            :label="editing ? 'Simpan' : 'Buat'"
            @click="save"
          />
        </div>
      </template>
    </UModal>

    <UModal
      :open="!!deleteTarget"
      title="Hapus sumber data?"
      description="Formulir yang memakainya akan otomatis dilepaskan dan berhenti mengisi data secara otomatis."
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
