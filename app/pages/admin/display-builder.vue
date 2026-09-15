<script setup lang="ts">
import { apiFetch } from '../../composables/useApi'
import { nullableValue, SELECT_NONE } from '#shared/constants/ui'
import { PERMISSIONS } from '#shared/constants/permissions'
import {
  CANVAS,
  WIDGET_CATALOG,
  WIDGET_META,
  defaultWidgetConfig,
  defaultWidgetStyle,
  type WidgetType,
} from '#shared/constants/widgets'

definePageMeta({ layout: 'admin', middleware: 'admin' })
useHead({ title: 'Display Builder' })

interface Widget {
  id?: string
  type: WidgetType
  x: number
  y: number
  width: number
  height: number
  zIndex: number
  isVisible: boolean
  animation: string | null
  config: Record<string, unknown>
  style: Record<string, unknown>
  mediaId: string | null
  playlistId: string | null
}

interface Template {
  id: string
  name: string
  type: 'GLOBAL' | 'QUEUE_TYPE'
  isDefault: boolean
  background: { color?: string, imageUrl?: string } | null
  widgets: Widget[]
  event: { id: string, name: string } | null
  devices: Array<{ id: string, name: string, deviceCode: string }>
  _count?: { widgets: number, devices: number }
}

const { can } = useMe()
const { call } = useApi()
const { currentId, loadEvents } = useCurrentEvent()
await loadEvents()

const editable = computed(() => can(PERMISSIONS.DISPLAY_TEMPLATE_MANAGE))

// ---- daftar template ----
const templates = ref<Template[]>([])
const template = ref<Template | null>(null)
const widgets = ref<Widget[]>([])
const background = ref<{ color?: string, imageUrl?: string }>({ color: '#020617' })

async function loadTemplates() {
  templates.value = await apiFetch<Template[]>('/api/admin/display-templates', {
    query: currentId.value ? { eventId: currentId.value } : {},
  })
}
await loadTemplates()

const mediaList = ref<Array<{ id: string, name: string, type: string, url: string }>>([])
const playlistList = ref<Array<{ id: string, name: string, items: Array<{ media: { url: string, type: string }, durationSeconds: number }> }>>([])

async function loadAssets() {
  const [media, playlists] = await Promise.all([
    apiFetch<typeof mediaList.value>('/api/admin/media'),
    apiFetch<typeof playlistList.value>('/api/admin/playlists'),
  ])
  mediaList.value = media
  playlistList.value = playlists
}
await loadAssets()

/** Field formulir milik event yang sedang dibuka, tanpa duplikat kunci. */
const formFieldOptions = computed(() => {
  const seen = new Set<string>()
  const items: Array<{ label: string, value: string }> = []
  for (const form of forms.value) {
    for (const field of form.fields ?? []) {
      if (seen.has(field.key)) continue
      seen.add(field.key)
      items.push({ label: `${field.label} · ${field.key}`, value: field.key })
    }
  }
  return items
})

/** Label field menurut Form Builder; jadi cadangan bila hanya kuncinya diketahui. */
function fieldLabelOf(key: string) {
  for (const form of forms.value) {
    const field = (form.fields ?? []).find(f => f.key === key)
    if (field) return field.label
  }
  return key
}

const mediaById = computed(() =>
  Object.fromEntries(mediaList.value.map(m => [m.id, { url: m.url, type: m.type }])))
const playlistById = computed(() =>
  Object.fromEntries(playlistList.value.map(p => [p.id, { items: p.items }])))

const queueTypes = ref<Array<{ id: string, code: string, name: string }>>([])

/**
 * Formulir event beserta field-nya (Form Builder, §18).
 *
 * Dipakai widget "Data Pengunjung": admin memilih isian mana yang boleh tampil di
 * layar, dan pilihannya disimpan berikut labelnya sehingga layar tidak perlu memuat
 * definisi formulir.
 */
const forms = ref<Array<{ id: string, name: string, fields: Array<{ id: string, key: string, label: string, type: string }> }>>([])

/**
 * Kedua permintaan sengaja DIMULAI bersamaan, bukan berurutan.
 *
 * Saat SSR, watcher `immediate` berjalan di dalam setup. Permintaan yang baru
 * dimulai setelah `await` sudah kehilangan konteks Nuxt, sehingga `apiFetch`
 * gagal membaca cookie dan seluruh halaman jatuh dengan 500. Memulai keduanya
 * lebih dulu membuat keduanya tetap berada di dalam konteks — sekaligus lebih cepat.
 */
watch(currentId, async () => {
  if (!currentId.value) return
  const [types, formList] = await Promise.all([
    apiFetch<Array<{ id: string, code: string, name: string }>>('/api/admin/queue-types', { query: { eventId: currentId.value } }),
    /**
     * Formulir hanya untuk mengisi panel properti; bila akunnya tidak punya izin
     * `form.view`, widget "Data Pengunjung" tetap bisa dipakai — hanya daftar
     * pilihannya kosong, bukan halamannya gagal terbuka.
     */
    apiFetch<typeof forms.value>('/api/admin/forms', { query: { eventId: currentId.value } }).catch(() => []),
    loadTemplates(),
  ])
  queueTypes.value = types
  forms.value = formList
}, { immediate: true })

// ---- riwayat undo/redo ----
const history = ref<string[]>([])
const historyIndex = ref(-1)
const dirty = ref(false)

function snapshot() {
  const state = JSON.stringify(widgets.value)
  if (history.value[historyIndex.value] === state) return
  history.value = history.value.slice(0, historyIndex.value + 1)
  history.value.push(state)
  historyIndex.value = history.value.length - 1
  dirty.value = true
}

function undo() {
  if (historyIndex.value <= 0) return
  historyIndex.value--
  widgets.value = JSON.parse(history.value[historyIndex.value]!)
  selectedIndex.value = null
  dirty.value = true
}

function redo() {
  if (historyIndex.value >= history.value.length - 1) return
  historyIndex.value++
  widgets.value = JSON.parse(history.value[historyIndex.value]!)
  selectedIndex.value = null
  dirty.value = true
}

async function openTemplate(id: string) {
  const detail = await apiFetch<Template>(`/api/admin/display-templates/${id}`)
  template.value = detail
  widgets.value = detail.widgets.map(w => ({
    ...w,
    config: (w.config ?? {}) as Record<string, unknown>,
    style: (w.style ?? {}) as Record<string, unknown>,
  }))
  background.value = detail.background ?? { color: '#020617' }
  selectedIndex.value = null
  history.value = [JSON.stringify(widgets.value)]
  historyIndex.value = 0
  dirty.value = false
}

function closeTemplate() {
  template.value = null
  widgets.value = []
  selectedIndex.value = null
}

// ---- kanvas ----
const canvasWrap = ref<HTMLElement | null>(null)
const scale = ref(0.4)
const selectedIndex = ref<number | null>(null)
const snapGrid = ref(10)
const showGrid = ref(true)
const previewMode = ref(false)

const selected = computed(() => (selectedIndex.value === null ? null : widgets.value[selectedIndex.value] ?? null))

function fitCanvas() {
  const el = canvasWrap.value
  if (!el) return
  const { width, height } = el.getBoundingClientRect()
  if (!width || !height) return
  scale.value = Math.min(width / CANVAS.width, height / CANVAS.height)
}

let observer: ResizeObserver | undefined
onMounted(() => {
  fitCanvas()
  observer = new ResizeObserver(fitCanvas)
  if (canvasWrap.value) observer.observe(canvasWrap.value)
})
onBeforeUnmount(() => observer?.disconnect())
watch(template, () => nextTick(fitCanvas))

const snap = (value: number) => Math.round(value / snapGrid.value) * snapGrid.value
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

function addWidget(type: WidgetType) {
  const meta = WIDGET_META[type]
  widgets.value.push({
    type,
    x: snap((CANVAS.width - meta.defaultSize.width) / 2),
    y: snap((CANVAS.height - meta.defaultSize.height) / 2),
    width: meta.defaultSize.width,
    height: meta.defaultSize.height,
    zIndex: widgets.value.length + 1,
    isVisible: true,
    animation: null,
    config: defaultWidgetConfig(type),
    style: defaultWidgetStyle(type) as Record<string, unknown>,
    mediaId: null,
    playlistId: null,
  })
  selectedIndex.value = widgets.value.length - 1
  snapshot()
}

function removeWidget(index: number) {
  widgets.value.splice(index, 1)
  selectedIndex.value = null
  snapshot()
}

function duplicateWidget(index: number) {
  const source = widgets.value[index]
  if (!source) return
  widgets.value.push({
    ...JSON.parse(JSON.stringify(source)),
    id: undefined,
    x: snap(source.x + 40),
    y: snap(source.y + 40),
    zIndex: widgets.value.length + 1,
  })
  selectedIndex.value = widgets.value.length - 1
  snapshot()
}

function bringForward(index: number) {
  const w = widgets.value[index]
  if (w) { w.zIndex = Math.min(999, w.zIndex + 1); snapshot() }
}
function sendBackward(index: number) {
  const w = widgets.value[index]
  if (w) { w.zIndex = Math.max(0, w.zIndex - 1); snapshot() }
}

// ---- seret & ubah ukuran ----
type DragMode = 'move' | 'nw' | 'ne' | 'sw' | 'se'
let drag: {
  mode: DragMode
  index: number
  startX: number
  startY: number
  origin: { x: number, y: number, width: number, height: number }
} | null = null

function onPointerDown(event: PointerEvent, index: number, mode: DragMode) {
  if (!editable.value || previewMode.value) return
  event.preventDefault()
  event.stopPropagation()

  const widget = widgets.value[index]
  if (!widget) return

  selectedIndex.value = index
  drag = {
    mode,
    index,
    startX: event.clientX,
    startY: event.clientY,
    origin: { x: widget.x, y: widget.y, width: widget.width, height: widget.height },
  }
  ;(event.target as HTMLElement).setPointerCapture?.(event.pointerId)
}

function onPointerMove(event: PointerEvent) {
  if (!drag) return
  const widget = widgets.value[drag.index]
  if (!widget) return

  // pointer bergerak dalam piksel layar; kanvas diskalakan, jadi dibagi balik
  const dx = (event.clientX - drag.startX) / scale.value
  const dy = (event.clientY - drag.startY) / scale.value
  const o = drag.origin
  const MIN = 40

  if (drag.mode === 'move') {
    widget.x = clamp(snap(o.x + dx), -o.width + MIN, CANVAS.width - MIN)
    widget.y = clamp(snap(o.y + dy), -o.height + MIN, CANVAS.height - MIN)
    return
  }

  if (drag.mode === 'se') {
    widget.width = Math.max(MIN, snap(o.width + dx))
    widget.height = Math.max(MIN, snap(o.height + dy))
  }
  else if (drag.mode === 'sw') {
    const width = Math.max(MIN, snap(o.width - dx))
    widget.x = snap(o.x + (o.width - width))
    widget.width = width
    widget.height = Math.max(MIN, snap(o.height + dy))
  }
  else if (drag.mode === 'ne') {
    const height = Math.max(MIN, snap(o.height - dy))
    widget.y = snap(o.y + (o.height - height))
    widget.height = height
    widget.width = Math.max(MIN, snap(o.width + dx))
  }
  else if (drag.mode === 'nw') {
    const width = Math.max(MIN, snap(o.width - dx))
    const height = Math.max(MIN, snap(o.height - dy))
    widget.x = snap(o.x + (o.width - width))
    widget.y = snap(o.y + (o.height - height))
    widget.width = width
    widget.height = height
  }
}

function onPointerUp() {
  if (!drag) return
  drag = null
  snapshot()
}

onMounted(() => {
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)
})
onBeforeUnmount(() => {
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
})

// ---- pintasan papan tik ----
function onKey(e: KeyboardEvent) {
  if (!template.value || !editable.value) return
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return

  const key = e.key.toLowerCase()

  if ((e.ctrlKey || e.metaKey) && key === 'z') {
    e.preventDefault()
    if (e.shiftKey) redo()
    else undo()
    return
  }
  if ((e.ctrlKey || e.metaKey) && key === 's') {
    e.preventDefault()
    void saveLayout()
    return
  }

  if (selectedIndex.value === null) return
  const widget = widgets.value[selectedIndex.value]
  if (!widget) return

  if (key === 'delete' || key === 'backspace') {
    e.preventDefault()
    removeWidget(selectedIndex.value)
    return
  }

  const step = e.shiftKey ? snapGrid.value * 5 : snapGrid.value
  const moves: Record<string, [number, number]> = {
    arrowleft: [-step, 0], arrowright: [step, 0], arrowup: [0, -step], arrowdown: [0, step],
  }
  const move = moves[key]
  if (move) {
    e.preventDefault()
    widget.x = clamp(widget.x + move[0], -widget.width + 40, CANVAS.width - 40)
    widget.y = clamp(widget.y + move[1], -widget.height + 40, CANVAS.height - 40)
    snapshot()
  }
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))

// ---- simpan & kelola template ----
async function saveLayout() {
  if (!template.value) return
  const res = await call(
    `/api/admin/display-templates/${template.value.id}/widgets`,
    {
      method: 'PUT',
      body: {
        widgets: widgets.value.map((w, index) => ({
          type: w.type,
          x: Math.round(w.x),
          y: Math.round(w.y),
          width: Math.round(w.width),
          height: Math.round(w.height),
          zIndex: w.zIndex || index + 1,
          config: w.config,
          style: w.style,
          animation: w.animation,
          isVisible: w.isVisible,
          mediaId: nullableValue(w.mediaId),
          playlistId: nullableValue(w.playlistId),
        })),
      },
    },
    'Tata letak disimpan',
  )
  if (res) {
    dirty.value = false
    await Promise.all([loadTemplates(), openTemplate(template.value.id)])
  }
}

async function saveBackground() {
  if (!template.value) return
  await call(
    `/api/admin/display-templates/${template.value.id}`,
    { method: 'PATCH', body: { background: background.value } },
    'Latar disimpan',
  )
  await loadTemplates()
}

const createOpen = ref(false)
const newTemplate = reactive({ name: '', type: 'GLOBAL' as 'GLOBAL' | 'QUEUE_TYPE', useEvent: true })

async function createTemplate() {
  const res = await call<Template>(
    '/api/admin/display-templates',
    {
      method: 'POST',
      body: {
        name: newTemplate.name,
        type: newTemplate.type,
        eventId: newTemplate.useEvent ? currentId.value : null,
      },
    },
    'Template dibuat',
  )
  if (res) {
    createOpen.value = false
    newTemplate.name = ''
    await loadTemplates()
    await openTemplate(res.id)
  }
}

async function duplicateTemplate(id: string) {
  const res = await call<Template>(`/api/admin/display-templates/${id}/duplicate`, { method: 'POST' }, 'Template disalin')
  if (res) { await loadTemplates(); await openTemplate(res.id) }
}

const deleteTarget = ref<Template | null>(null)
async function confirmDelete() {
  if (!deleteTarget.value) return
  const res = await call(`/api/admin/display-templates/${deleteTarget.value.id}`, { method: 'DELETE' }, 'Template dihapus')
  const wasOpen = template.value?.id === deleteTarget.value.id
  deleteTarget.value = null
  if (res) { if (wasOpen) closeTemplate(); await loadTemplates() }
}

// ---- panel properti ----
const mediaOptions = computed(() => [
  { label: '— tidak dipilih —', value: SELECT_NONE },
  ...mediaList.value.map(m => ({ label: `${m.type === 'VIDEO' ? '🎬' : '🖼'} ${m.name}`, value: m.id })),
])
const playlistOptions = computed(() => [
  { label: '— tidak dipilih —', value: SELECT_NONE },
  ...playlistList.value.map(p => ({ label: p.name, value: p.id })),
])
const queueTypeOptions = computed(() => [
  /**
   * Arti "tidak dipilih" berbeda per widget: papan loket menampilkan SELURUH loket
   * event, sedangkan widget lain jatuh ke layanan pertama.
   */
  {
    label: selected.value?.type === 'COUNTER_BOARD' ? 'Semua loket event' : 'Layanan pertama',
    value: SELECT_NONE,
  },
  ...queueTypes.value.map(q => ({ label: `${q.code} · ${q.name}`, value: q.id })),
])

function onPropertyChange() {
  snapshot()
}

/**
 * Select tidak menerima string kosong, sedangkan "tidak dipilih" harus tersimpan
 * sebagai null. Proksi ini menerjemahkan keduanya di satu tempat.
 */
function nullableProxy(read: () => string | null, write: (value: string | null) => void) {
  return computed({
    get: () => read() ?? SELECT_NONE,
    set: (value: string) => write(nullableValue(value)),
  })
}

const selectedMediaId = nullableProxy(
  () => selected.value?.mediaId ?? null,
  (value) => { if (selected.value) selected.value.mediaId = value },
)
const selectedPlaylistId = nullableProxy(
  () => selected.value?.playlistId ?? null,
  (value) => { if (selected.value) selected.value.playlistId = value },
)
const selectedQueueTypeId = nullableProxy(
  () => (selected.value?.config.queueTypeId as string | undefined) ?? null,
  (value) => { if (selected.value) selected.value.config.queueTypeId = value ?? undefined },
)
/**
 * Pilihan isian formulir pada widget "Data Pengunjung".
 *
 * Yang tersimpan bukan hanya kuncinya, tetapi juga labelnya — layar memakai label
 * itu apa adanya, jadi mengubah nama field di Form Builder tidak mengubah tampilan
 * layar yang sudah berjalan sampai admin memilihnya lagi.
 */
const selectedFieldKeys = computed({
  get: () => ((selected.value?.config.fields as Array<{ key: string }> | undefined) ?? []).map(f => f.key),
  set: (keys: string[]) => {
    if (!selected.value) return
    selected.value.config.fields = keys.map(key => ({ key, label: fieldLabelOf(key) }))
    onPropertyChange()
  },
})

const backgroundImage = computed({
  get: () => background.value.imageUrl ?? SELECT_NONE,
  set: (value: string) => { background.value.imageUrl = nullableValue(value) ?? undefined },
})

const layers = computed(() =>
  widgets.value
    .map((w, index) => ({ widget: w, index }))
    .sort((a, b) => b.widget.zIndex - a.widget.zIndex))
</script>

<template>
  <div>
    <!-- ============ DAFTAR TEMPLATE ============ -->
    <template v-if="!template">
      <UiPageHeading
        title="Display Builder"
        icon="i-lucide-layout-template"
        description="Susun tata letak layar antrean tanpa menulis kode. Satu template bisa dipakai banyak perangkat."
      >
        <template #actions>
          <UiEventPicker />
          <UButton
            v-if="editable"
            icon="i-lucide-plus"
            label="Template Baru"
            @click="createOpen = true"
          />
        </template>
      </UiPageHeading>

      <div v-if="!templates.length" class="rounded-xl border border-dashed border-slate-300 py-16 text-center dark:border-slate-700">
        <UIcon name="i-lucide-layout-template" class="mx-auto size-10 text-slate-400" />
        <p class="mt-3 font-medium">
          Belum ada template
        </p>
        <p class="mx-auto mt-1 max-w-md text-sm text-slate-500">
          Tanpa template, layar memakai tata letak bawaan. Buat template bila ingin mengatur sendiri
          posisi nomor antrean, logo, video, dan teks berjalan.
        </p>
        <UButton v-if="editable" class="mt-4" icon="i-lucide-plus" label="Buat Template" @click="createOpen = true" />
      </div>

      <div v-else class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <div
          v-for="item in templates"
          :key="item.id"
          class="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
        >
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <p class="truncate font-semibold">
                {{ item.name }}
              </p>
              <p class="text-xs text-slate-500">
                {{ item.type === 'GLOBAL' ? 'Global' : 'Per layanan' }}
                · {{ item._count?.widgets ?? 0 }} widget
                · {{ item._count?.devices ?? 0 }} perangkat
              </p>
            </div>
            <UBadge v-if="item.isDefault" size="sm" color="primary" variant="subtle" label="Bawaan" />
          </div>

          <p v-if="item.event" class="mt-2 text-xs text-slate-400">
            Event: {{ item.event.name }}
          </p>

          <div class="mt-4 flex flex-wrap gap-2">
            <UButton size="sm" icon="i-lucide-pencil-ruler" :label="editable ? 'Susun' : 'Lihat'" @click="openTemplate(item.id)" />
            <UiActionButton
              v-if="editable"
              size="sm"
              variant="outline"
              color="neutral"
              icon="i-lucide-copy"
              label="Duplikat"
              :action="() => duplicateTemplate(item.id)"
            />
            <UButton
              v-if="editable"
              size="sm"
              variant="ghost"
              color="error"
              icon="i-lucide-trash-2"
              aria-label="Hapus template"
              title="Hapus template"
              @click="deleteTarget = item"
            />
          </div>
        </div>
      </div>
    </template>

    <!-- ============ EDITOR ============ -->
    <template v-else>
      <div class="mb-4 flex flex-wrap items-center gap-3">
        <UButton icon="i-lucide-arrow-left" variant="ghost" color="neutral" label="Semua Template" @click="closeTemplate" />

        <div class="min-w-0">
          <p class="truncate font-semibold">
            {{ template.name }}
          </p>
          <p class="text-xs text-slate-500">
            {{ CANVAS.width }}×{{ CANVAS.height }} · {{ widgets.length }} widget
            <span v-if="dirty" class="text-amber-600">· belum disimpan</span>
          </p>
        </div>

        <div class="ml-auto flex flex-wrap items-center gap-2">
          <UButton
            :icon="previewMode ? 'i-lucide-pencil-ruler' : 'i-lucide-eye'"
            variant="outline"
            color="neutral"
            :label="previewMode ? 'Mode Susun' : 'Pratinjau'"
            @click="previewMode = !previewMode"
          />
          <UButton
            v-if="editable"
            icon="i-lucide-undo-2"
            variant="ghost"
            color="neutral"
            :disabled="historyIndex <= 0"
            aria-label="Batalkan perubahan"
            title="Batalkan perubahan (Ctrl+Z)"
            @click="undo"
          />
          <UButton
            v-if="editable"
            icon="i-lucide-redo-2"
            variant="ghost"
            color="neutral"
            :disabled="historyIndex >= history.length - 1"
            aria-label="Ulangi perubahan"
            title="Ulangi perubahan (Ctrl+Shift+Z)"
            @click="redo"
          />
          <UiActionButton
            v-if="editable"
            icon="i-lucide-save"
            label="Simpan"
            :action="saveLayout"
          />
        </div>
      </div>

      <div class="grid gap-4 xl:grid-cols-12">
        <!-- Palet -->
        <div v-if="editable && !previewMode" class="xl:col-span-2">
          <div class="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
            <h2 class="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Widget
            </h2>
            <div class="grid grid-cols-2 gap-1.5 xl:grid-cols-1">
              <button
                v-for="meta in WIDGET_CATALOG"
                :key="meta.type"
                type="button"
                class="flex items-center gap-2 rounded-lg border border-slate-200 px-2 py-1.5 text-left text-xs transition-colors hover:border-brand-400 hover:bg-brand-50 dark:border-slate-800 dark:hover:bg-slate-800"
                :title="meta.description"
                @click="addWidget(meta.type)"
              >
                <UIcon :name="meta.icon" class="size-3.5 shrink-0 text-slate-400" />
                <span class="truncate">{{ meta.label }}</span>
              </button>
            </div>
          </div>
        </div>

        <!-- Kanvas -->
        <div :class="previewMode ? 'xl:col-span-12' : editable ? 'xl:col-span-7' : 'xl:col-span-9'">
          <div
            ref="canvasWrap"
            class="relative aspect-video w-full overflow-hidden rounded-xl border border-slate-300 bg-slate-950 dark:border-slate-700"
            @pointerdown.self="selectedIndex = null"
          >
            <!-- Pratinjau memakai renderer yang sama persis dengan layar sungguhan -->
            <DisplayRenderer
              v-if="previewMode"
              :widgets="widgets as never"
              :background="background"
              :media-by-id="mediaById"
              :playlist-by-id="playlistById"
              preview
            />

            <template v-else>
              <div
                class="absolute left-1/2 top-1/2 origin-center"
                :style="{
                  width: `${CANVAS.width}px`,
                  height: `${CANVAS.height}px`,
                  transform: `translate(-50%, -50%) scale(${scale})`,
                  backgroundColor: background.color ?? '#020617',
                  backgroundImage: background.imageUrl ? `url(${background.imageUrl})` : undefined,
                  backgroundSize: 'cover',
                }"
              >
                <!-- garis bantu -->
                <div
                  v-if="showGrid"
                  class="pointer-events-none absolute inset-0 opacity-25"
                  :style="{
                    backgroundImage: 'linear-gradient(to right, #64748b 1px, transparent 1px), linear-gradient(to bottom, #64748b 1px, transparent 1px)',
                    backgroundSize: '120px 120px',
                  }"
                />

                <div
                  v-for="(widget, index) in widgets"
                  :key="index"
                  class="absolute cursor-move border-2 transition-colors"
                  :class="[
                    selectedIndex === index ? 'border-brand-400' : 'border-transparent hover:border-brand-400/50',
                    widget.isVisible ? '' : 'opacity-30',
                  ]"
                  :style="{
                    left: `${widget.x}px`,
                    top: `${widget.y}px`,
                    width: `${widget.width}px`,
                    height: `${widget.height}px`,
                    zIndex: widget.zIndex,
                    backgroundColor: (widget.style.backgroundColor as string) ?? 'rgba(148,163,184,0.15)',
                    borderRadius: `${widget.style.radius ?? 0}px`,
                  }"
                  @pointerdown="onPointerDown($event, index, 'move')"
                >
                  <div
                    class="pointer-events-none flex size-full flex-col items-center justify-center overflow-hidden px-2 text-center"
                    :style="{ color: (widget.style.color as string) ?? '#fff' }"
                  >
                    <UIcon :name="WIDGET_META[widget.type].icon" class="size-10 opacity-60" />
                    <span class="mt-1 text-3xl font-semibold opacity-80">{{ WIDGET_META[widget.type].label }}</span>
                    <span v-if="widget.type === 'TEXT'" class="mt-1 truncate text-2xl opacity-60">
                      {{ widget.config.text }}
                    </span>
                  </div>

                  <!-- pegangan ubah ukuran -->
                  <template v-if="selectedIndex === index && editable">
                    <span
                      v-for="handle in (['nw', 'ne', 'sw', 'se'] as const)"
                      :key="handle"
                      class="absolute size-6 rounded-full border-4 border-white bg-brand-500"
                      :class="{
                        '-left-3 -top-3 cursor-nwse-resize': handle === 'nw',
                        '-right-3 -top-3 cursor-nesw-resize': handle === 'ne',
                        '-bottom-3 -left-3 cursor-nesw-resize': handle === 'sw',
                        '-bottom-3 -right-3 cursor-nwse-resize': handle === 'se',
                      }"
                      @pointerdown="onPointerDown($event, index, handle)"
                    />
                  </template>
                </div>
              </div>
            </template>
          </div>

          <div v-if="!previewMode" class="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-500">
            <UCheckbox v-model="showGrid" label="Garis bantu" />
            <span>Snap</span>
            <USelect
              v-model="snapGrid"
              :items="[{ label: '1 px', value: 1 }, { label: '10 px', value: 10 }, { label: '20 px', value: 20 }]"
              size="xs"
              class="w-24"
            />
            <span class="ml-auto">
              Klik widget untuk memilih · panah menggeser · Delete menghapus · Ctrl+Z undo · Ctrl+S simpan
            </span>
          </div>
        </div>

        <!-- Properti + lapisan -->
        <div v-if="!previewMode" :class="editable ? 'xl:col-span-3' : 'xl:col-span-3'">
          <div class="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <h2 class="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Properti
            </h2>

            <div v-if="!selected" class="py-8 text-center text-sm text-slate-500">
              Pilih widget pada kanvas untuk mengatur propertinya.
            </div>

            <div v-else class="space-y-3" @change="onPropertyChange">
              <p class="text-sm font-medium">
                {{ WIDGET_META[selected.type].label }}
              </p>

              <div class="grid grid-cols-2 gap-2">
                <UFormField label="X" size="xs">
                  <UInputNumber v-model="selected.x" :step="snapGrid" class="w-full" size="sm" />
                </UFormField>
                <UFormField label="Y" size="xs">
                  <UInputNumber v-model="selected.y" :step="snapGrid" class="w-full" size="sm" />
                </UFormField>
                <UFormField label="Lebar" size="xs">
                  <UInputNumber v-model="selected.width" :min="40" :step="snapGrid" class="w-full" size="sm" />
                </UFormField>
                <UFormField label="Tinggi" size="xs">
                  <UInputNumber v-model="selected.height" :min="40" :step="snapGrid" class="w-full" size="sm" />
                </UFormField>
              </div>

              <!-- konfigurasi khas tiap tipe -->
              <UFormField v-if="selected.type === 'TEXT' || selected.type === 'RUNNING_TEXT'" label="Teks" size="xs">
                <UTextarea v-model="selected.config.text as string" :rows="2" class="w-full" size="sm" />
              </UFormField>

              <UFormField v-if="WIDGET_META[selected.type].needsQueueType" label="Jenis Antrean" size="xs">
                <USelect v-model="selectedQueueTypeId" :items="queueTypeOptions" class="w-full" size="sm" />
              </UFormField>

              <UFormField v-if="selected.type === 'QUEUE_LIST'" label="Jumlah Nomor" size="xs">
                <UInputNumber v-model="selected.config.limit as number" :min="1" :max="10" class="w-full" size="sm" />
              </UFormField>

              <template v-if="WIDGET_META[selected.type].needsFormFields">
                <UFormField
                  label="Isian dari Form Builder"
                  :help="formFieldOptions.length
                    ? 'Hanya isian yang dipilih di sini yang dikirim ke layar.'
                    : 'Event ini belum punya formulir — buat dulu di Form Builder.'"
                  size="xs"
                >
                  <USelectMenu
                    v-model="selectedFieldKeys"
                    :items="formFieldOptions"
                    value-key="value"
                    multiple
                    :disabled="!formFieldOptions.length"
                    placeholder="Pilih isian formulir"
                    class="w-full"
                    size="sm"
                  />
                </UFormField>
                <UCheckbox
                  :model-value="selected.config.showQueueNumber !== false"
                  label="Tampilkan nomor antrean"
                  size="sm"
                  @update:model-value="(v) => { selected!.config.showQueueNumber = v === true; onPropertyChange() }"
                />
                <UCheckbox
                  :model-value="selected.config.showLabel !== false"
                  label="Tampilkan label isian"
                  size="sm"
                  @update:model-value="(v) => { selected!.config.showLabel = v === true; onPropertyChange() }"
                />
                <UCheckbox
                  :model-value="selected.config.mask === true"
                  label="Samarkan sebagian isian"
                  size="sm"
                  @update:model-value="(v) => { selected!.config.mask = v === true; onPropertyChange() }"
                />
              </template>

              <template v-if="selected.type === 'COUNTER_BOARD'">
                <UFormField label="Kolom" help="0 = mengikuti jumlah loket" size="xs">
                  <UInputNumber v-model="selected.config.columns as number" :min="0" :max="6" class="w-full" size="sm" />
                </UFormField>
                <UCheckbox
                  :model-value="selected.config.showEmpty !== false"
                  label="Tampilkan loket yang belum memanggil"
                  size="sm"
                  @update:model-value="(v) => { selected!.config.showEmpty = v === true; onPropertyChange() }"
                />
                <UCheckbox
                  :model-value="selected.config.showService !== false"
                  label="Tampilkan nama layanan di tiap loket"
                  size="sm"
                  @update:model-value="(v) => { selected!.config.showService = v === true; onPropertyChange() }"
                />
              </template>

              <UFormField v-if="WIDGET_META[selected.type].needsMedia" label="Media" size="xs">
                <USelect v-model="selectedMediaId" :items="mediaOptions" class="w-full" size="sm" />
              </UFormField>

              <UFormField v-if="WIDGET_META[selected.type].needsPlaylist" label="Playlist" size="xs">
                <USelect v-model="selectedPlaylistId" :items="playlistOptions" class="w-full" size="sm" />
              </UFormField>

              <!-- gaya -->
              <div class="grid grid-cols-2 gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                <UFormField label="Ukuran Teks" size="xs">
                  <UInputNumber v-model="selected.style.fontSize as number" :min="8" :max="400" class="w-full" size="sm" />
                </UFormField>
                <UFormField label="Ketebalan" size="xs">
                  <USelect
                    v-model="selected.style.fontWeight as number"
                    :items="[400, 500, 600, 700, 800].map(v => ({ label: String(v), value: v }))"
                    class="w-full"
                    size="sm"
                  />
                </UFormField>
                <UFormField label="Warna Teks" size="xs">
                  <UiColorPicker
                    :model-value="(selected.style.color as string) ?? '#ffffff'"
                    label="Warna teks widget"
                    alpha
                    hide-input
                    @update:model-value="(v: string) => { selected!.style.color = v; onPropertyChange() }"
                  />
                </UFormField>
                <UFormField label="Latar" size="xs">
                  <UiColorPicker
                    :model-value="(selected.style.backgroundColor as string) ?? '#0f172a'"
                    label="Warna latar widget"
                    alpha
                    hide-input
                    @update:model-value="(v: string) => { selected!.style.backgroundColor = v; onPropertyChange() }"
                  />
                </UFormField>
                <UFormField label="Perataan" size="xs">
                  <USelect
                    v-model="selected.style.align as string"
                    :items="[{ label: 'Kiri', value: 'left' }, { label: 'Tengah', value: 'center' }, { label: 'Kanan', value: 'right' }]"
                    class="w-full"
                    size="sm"
                  />
                </UFormField>
                <UFormField label="Sudut" size="xs">
                  <UInputNumber v-model="selected.style.radius as number" :min="0" :max="200" class="w-full" size="sm" />
                </UFormField>
              </div>

              <div class="flex flex-wrap gap-1 border-t border-slate-100 pt-3 dark:border-slate-800">
                <UButton size="xs" variant="outline" color="neutral" icon="i-lucide-arrow-up" label="Ke depan" @click="bringForward(selectedIndex!)" />
                <UButton size="xs" variant="outline" color="neutral" icon="i-lucide-arrow-down" label="Ke belakang" @click="sendBackward(selectedIndex!)" />
                <UButton size="xs" variant="outline" color="neutral" icon="i-lucide-copy" label="Duplikat" @click="duplicateWidget(selectedIndex!)" />
                <UButton size="xs" variant="ghost" color="error" icon="i-lucide-trash-2" label="Hapus" @click="removeWidget(selectedIndex!)" />
              </div>
            </div>
          </div>

          <!-- Lapisan -->
          <div class="mt-4 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <h2 class="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Lapisan
            </h2>
            <div v-if="!layers.length" class="py-4 text-center text-sm text-slate-500">
              Belum ada widget.
            </div>
            <ul v-else class="space-y-1">
              <li
                v-for="layer in layers"
                :key="layer.index"
                class="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm transition-colors"
                :class="selectedIndex === layer.index ? 'bg-brand-50 dark:bg-brand-950' : 'hover:bg-slate-50 dark:hover:bg-slate-800'"
                @click="selectedIndex = layer.index"
              >
                <UIcon :name="WIDGET_META[layer.widget.type].icon" class="size-3.5 shrink-0 text-slate-400" />
                <span class="min-w-0 flex-1 truncate">{{ WIDGET_META[layer.widget.type].label }}</span>
                <span class="text-xs text-slate-400">z{{ layer.widget.zIndex }}</span>
                <UButton
                  :icon="layer.widget.isVisible ? 'i-lucide-eye' : 'i-lucide-eye-off'"
                  :aria-label="layer.widget.isVisible ? 'Sembunyikan widget' : 'Tampilkan widget'"
                  :title="layer.widget.isVisible ? 'Sembunyikan widget' : 'Tampilkan widget'"
                  size="xs"
                  variant="ghost"
                  color="neutral"
                  @click.stop="layer.widget.isVisible = !layer.widget.isVisible; snapshot()"
                />
              </li>
            </ul>
          </div>

          <!-- Latar -->
          <div class="mt-4 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <h2 class="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Latar Layar
            </h2>
            <div class="flex items-center gap-2">
              <UiColorPicker
                :model-value="(background.color as string) ?? '#020617'"
                label="Warna latar layar"
                hide-input
                @update:model-value="(v: string) => (background.color = v)"
              />
              <USelect
                v-model="backgroundImage"
                :items="[{ label: '— tanpa gambar —', value: SELECT_NONE }, ...mediaList.filter(m => m.type === 'IMAGE').map(m => ({ label: m.name, value: m.url }))]"
                class="min-w-0 flex-1"
                size="sm"
              />
            </div>
            <UiActionButton
              v-if="editable"
              class="mt-2"
              size="xs"
              variant="outline"
              color="neutral"
              icon="i-lucide-save"
              label="Simpan Latar"
              :action="saveBackground"
            />
          </div>

          <!-- Perangkat pemakai -->
          <div v-if="template.devices.length" class="mt-4 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <h2 class="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Dipakai Perangkat
            </h2>
            <ul class="space-y-1 text-sm">
              <li v-for="device in template.devices" :key="device.id" class="flex items-center gap-2">
                <UIcon name="i-lucide-tv" class="size-3.5 text-slate-400" />
                <span class="truncate">{{ device.name }}</span>
                <UButton
                  size="xs"
                  variant="ghost"
                  color="neutral"
                  icon="i-lucide-external-link"
                  aria-label="Buka layar di tab baru"
                  title="Buka layar di tab baru"
                  :to="`/display/${device.deviceCode}`"
                  target="_blank"
                  class="ml-auto"
                />
              </li>
            </ul>
          </div>
        </div>
      </div>
    </template>

    <!-- Template baru -->
    <UModal v-model:open="createOpen" title="Template Baru" description="Kanvas 1920×1080 yang bisa dipakai banyak perangkat.">
      <template #body>
        <div class="space-y-4">
          <UFormField label="Nama Template" required>
            <UInput v-model="newTemplate.name" class="w-full" placeholder="Lobby Utama" />
          </UFormField>
          <UFormField label="Tipe">
            <USelect
              v-model="newTemplate.type"
              :items="[{ label: 'Global — semua layanan', value: 'GLOBAL' }, { label: 'Khusus satu layanan', value: 'QUEUE_TYPE' }]"
              class="w-full"
            />
          </UFormField>
          <UCheckbox v-model="newTemplate.useEvent" label="Kaitkan dengan event yang sedang dipilih" />
        </div>
      </template>
      <template #footer="{ close }">
        <div class="flex w-full justify-end gap-2">
          <UButton variant="ghost" color="neutral" label="Batal" @click="close" />
          <UiActionButton :disabled="newTemplate.name.trim().length < 2" icon="i-lucide-plus" label="Buat" :action="createTemplate" />
        </div>
      </template>
    </UModal>

    <UModal
      :open="!!deleteTarget"
      title="Hapus template?"
      :description="`&quot;${deleteTarget?.name}&quot; beserta seluruh widget-nya akan dihapus.`"
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
