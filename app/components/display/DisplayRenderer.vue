<script setup lang="ts">
import { CANVAS, type WidgetType } from '#shared/constants/widgets'
import { PRIORITY_LABEL, isPriorityQueue } from '#shared/constants/queue'

/**
 * Menggambar satu template display pada kanvas 1920×1080, lalu menskalakannya
 * agar pas pada wadah yang tersedia.
 *
 * Komponen ini dipakai DUA tempat: layar sungguhan dan pratinjau di builder.
 * Satu implementasi berarti apa yang dilihat admin memang yang akan tampil.
 */
export interface RenderWidget {
  id?: string
  type: WidgetType
  x: number
  y: number
  width: number
  height: number
  zIndex: number
  isVisible?: boolean
  animation?: string | null
  config?: Record<string, unknown> | null
  style?: Record<string, unknown> | null
  mediaId?: string | null
  playlistId?: string | null
}

export interface BoardEntry {
  queueType: { id: string, code: string, name: string, color: string }
  current: {
    queueNumber: string
    status: string
    priority?: number
    counter: { name: string } | null
    /** Isian formulir pengunjung, hanya field yang dipasang di template (§18). */
    fields?: Record<string, string>
  } | null
  waitingCount: number
  nextNumbers: string[]
}

/** Satu loket beserta nomor yang sedang dilayaninya (§19). */
export interface CounterEntry {
  id: string
  code: string
  name: string
  services: Array<{ id: string, code: string, name: string, color: string }>
  current: {
    queueNumber: string
    status: string
    priority?: number
    queueType: { id: string, code: string, name: string, color: string } | null
  } | null
}

const props = defineProps<{
  widgets: RenderWidget[]
  background?: { color?: string, imageUrl?: string } | null
  board?: BoardEntry[]
  counters?: CounterEntry[]
  organizationName?: string | null
  announcements?: Array<{ id: string, message: string }>
  mediaById?: Record<string, { url: string, type: string }>
  playlistById?: Record<string, { items: Array<{ media: { url: string, type: string }, durationSeconds: number }> }>
  qrUrl?: string | null
  /** nomor yang sedang disorot karena baru dipanggil */
  highlighted?: string | null
  /** builder menampilkan data contoh agar kanvas tidak kosong */
  preview?: boolean
}>()

const container = ref<HTMLElement | null>(null)
const scale = ref(1)

function fit() {
  const el = container.value
  if (!el) return
  const { width, height } = el.getBoundingClientRect()
  if (!width || !height) return
  scale.value = Math.min(width / CANVAS.width, height / CANVAS.height)
}

let observer: ResizeObserver | undefined
onMounted(() => {
  fit()
  observer = new ResizeObserver(fit)
  if (container.value) observer.observe(container.value)
})
onBeforeUnmount(() => observer?.disconnect())

// ---- jam ----
const now = ref(new Date())
let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => { timer = setInterval(() => { now.value = new Date() }, 1000) })
onBeforeUnmount(() => clearInterval(timer))

const visibleWidgets = computed(() =>
  props.widgets.filter(w => w.isVisible !== false).slice().sort((a, b) => a.zIndex - b.zIndex))

const runningText = computed(() => {
  const messages = props.announcements?.map(a => a.message) ?? []
  if (messages.length) return messages.join('   •   ')
  return props.preview ? 'Contoh teks berjalan — pengumuman aktif akan tampil di sini' : ''
})

/** Widget dengan queueTypeId tertentu, atau layanan pertama bila belum dipilih. */
function entryFor(widget: RenderWidget): BoardEntry | null {
  const board = props.board ?? []
  const wanted = widget.config?.queueTypeId as string | undefined
  return board.find(b => b.queueType.id === wanted) ?? board[0] ?? null
}

/** Loket contoh untuk pratinjau builder, supaya tata letaknya bisa dinilai. */
const PREVIEW_COUNTERS: CounterEntry[] = [
  { id: 'p1', code: 'L1', name: 'Loket 1', services: [], current: { queueNumber: 'A023', status: 'SERVING', priority: 0, queueType: { id: 'a', code: 'A', name: 'Pelayanan Umum', color: '#1b5cf5' } } },
  { id: 'p2', code: 'L2', name: 'Loket 2', services: [], current: { queueNumber: 'A024', status: 'CALLED', priority: 1, queueType: { id: 'a', code: 'A', name: 'Pelayanan Umum', color: '#1b5cf5' } } },
  { id: 'p3', code: 'L3', name: 'Loket 3', services: [], current: { queueNumber: 'B008', status: 'SERVING', priority: 0, queueType: { id: 'b', code: 'B', name: 'Pelayanan Khusus', color: '#7c3aed' } } },
  { id: 'p4', code: 'L4', name: 'Loket 4', services: [], current: null },
]

/**
 * Loket yang ditampilkan sebuah widget papan-loket.
 *
 * Bila widget dikunci pada satu jenis antrean, hanya loket yang MELAYANI jenis itu
 * yang tampil — sesuai cara kerja loket sekarang: satu loket bisa melayani beberapa
 * layanan, dan satu layanan bisa dilayani beberapa loket (§12).
 */
function countersFor(widget: RenderWidget): CounterEntry[] {
  const all = props.counters?.length ? props.counters : (props.preview ? PREVIEW_COUNTERS : [])
  const wanted = widget.config?.queueTypeId as string | undefined
  const list = wanted ? all.filter(c => c.services.some(s => s.id === wanted)) : all
  return widget.config?.showEmpty === false ? list.filter(c => c.current) : list
}

/** Jumlah kolom: mengikuti jumlah loket bila belum diatur, maksimal 4 per baris. */
function counterColumns(widget: RenderWidget): number {
  const configured = Number(widget.config?.columns ?? 0)
  if (configured >= 1) return Math.min(configured, 6)
  return Math.min(Math.max(countersFor(widget).length, 1), 4)
}

/**
 * Isian formulir yang ditampilkan widget "Data Pengunjung".
 *
 * Label disimpan di dalam konfigurasi widget saat admin memilihnya, jadi layar tidak
 * perlu memuat definisi formulir sama sekali — dan label tetap utuh walau formulirnya
 * kemudian diubah.
 */
function visitorFieldsFor(widget: RenderWidget) {
  const configured = (widget.config?.fields as Array<{ key: string, label: string }> | undefined) ?? []
  const values = entryFor(widget)?.current?.fields ?? {}
  const masked = widget.config?.mask === true

  return configured
    .filter(field => field?.key)
    .map((field, index) => {
      const raw = values[field.key] ?? (props.preview ? (index === 0 ? 'Budi Santoso' : 'Contoh isian') : '')
      return { key: field.key, label: field.label || field.key, value: masked ? maskValue(raw) : raw }
    })
    .filter(field => field.value)
}

/**
 * Samarkan sebagian isian.
 *
 * Untuk layar di ruang tunggu yang ramai: nama tetap bisa dikenali pemiliknya,
 * tetapi tidak terbaca lengkap oleh semua orang. Separuh awal dibiarkan (minimal
 * dua karakter), sisanya diganti titik.
 */
function maskValue(value: string) {
  const text = value.trim()
  if (text.length <= 3) return text
  const keep = Math.max(2, Math.ceil(text.length / 2))
  return text.slice(0, keep) + '•'.repeat(Math.min(6, text.length - keep))
}

function styleOf(widget: RenderWidget) {
  const s = (widget.style ?? {}) as Record<string, string | number>
  return {
    left: `${widget.x}px`,
    top: `${widget.y}px`,
    width: `${widget.width}px`,
    height: `${widget.height}px`,
    zIndex: widget.zIndex,
    color: (s.color as string) ?? '#ffffff',
    backgroundColor: (s.backgroundColor as string) ?? 'transparent',
    borderRadius: `${s.radius ?? 0}px`,
    padding: `${s.padding ?? 0}px`,
    opacity: s.opacity ?? 1,
    fontSize: s.fontSize ? `${s.fontSize}px` : undefined,
    fontWeight: s.fontWeight ?? undefined,
    textAlign: (s.align as 'left' | 'center' | 'right') ?? 'center',
  }
}

function alignClass(widget: RenderWidget) {
  const align = (widget.style?.align as string) ?? 'center'
  return align === 'left' ? 'items-start text-left' : align === 'right' ? 'items-end text-right' : 'items-center text-center'
}

function objectFit(widget: RenderWidget) {
  return ((widget.style?.objectFit as string) ?? 'cover') === 'contain' ? 'object-contain' : 'object-cover'
}

function mediaOf(widget: RenderWidget) {
  return widget.mediaId ? props.mediaById?.[widget.mediaId] ?? null : null
}

// ---- rotasi playlist ----
const playlistIndex = ref<Record<string, number>>({})
const playlistTimers: Record<string, ReturnType<typeof setTimeout>> = {}

function scheduleNext(widgetKey: string, playlistId: string) {
  const playlist = props.playlistById?.[playlistId]
  if (!playlist?.items.length) return

  const index = playlistIndex.value[widgetKey] ?? 0
  const item = playlist.items[index % playlist.items.length]!

  clearTimeout(playlistTimers[widgetKey])
  playlistTimers[widgetKey] = setTimeout(() => {
    playlistIndex.value = { ...playlistIndex.value, [widgetKey]: (index + 1) % playlist.items.length }
    scheduleNext(widgetKey, playlistId)
  }, Math.max(1, item.durationSeconds) * 1000)
}

function playlistItemFor(widget: RenderWidget) {
  const playlist = widget.playlistId ? props.playlistById?.[widget.playlistId] : null
  if (!playlist?.items.length) return null
  const key = widget.id ?? `${widget.type}-${widget.x}-${widget.y}`
  return playlist.items[(playlistIndex.value[key] ?? 0) % playlist.items.length] ?? null
}

watchEffect(() => {
  for (const widget of props.widgets) {
    if (widget.type !== 'PLAYLIST' || !widget.playlistId) continue
    const key = widget.id ?? `${widget.type}-${widget.x}-${widget.y}`
    if (!(key in playlistIndex.value)) {
      playlistIndex.value = { ...playlistIndex.value, [key]: 0 }
      scheduleNext(key, widget.playlistId)
    }
  }
})

onBeforeUnmount(() => {
  for (const t of Object.values(playlistTimers)) clearTimeout(t)
})

const timeText = computed(() => now.value.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }))
const timeTextShort = computed(() => now.value.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }))
const dateText = computed(() => now.value.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))
</script>

<template>
  <div ref="container" class="relative size-full overflow-hidden">
    <!-- kanvas berukuran tetap, diskalakan ke wadah -->
    <div
      class="absolute left-1/2 top-1/2 origin-center"
      :style="{
        width: `${CANVAS.width}px`,
        height: `${CANVAS.height}px`,
        transform: `translate(-50%, -50%) scale(${scale})`,
        backgroundColor: background?.color ?? '#020617',
        backgroundImage: background?.imageUrl ? `url(${background.imageUrl})` : undefined,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }"
    >
      <div
        v-for="(widget, index) in visibleWidgets"
        :key="widget.id ?? index"
        class="absolute flex flex-col justify-center overflow-hidden"
        :class="alignClass(widget)"
        :style="styleOf(widget)"
      >
        <!-- Nomor yang sedang dipanggil -->
        <template v-if="widget.type === 'CURRENT_QUEUE'">
          <p
            v-if="isPriorityQueue(entryFor(widget)?.current?.priority)"
            data-priority-badge
            class="w-full truncate font-extrabold uppercase tracking-[0.2em] text-amber-400"
            :style="{ fontSize: '0.2em' }"
          >
            ★ {{ PRIORITY_LABEL }}
          </p>
          <p v-if="widget.config?.showQueueTypeName !== false" class="w-full truncate opacity-70" :style="{ fontSize: '0.22em' }">
            {{ entryFor(widget)?.queueType.name ?? (preview ? 'Pelayanan Umum' : '—') }}
          </p>
          <p
            class="queue-number w-full leading-none"
            :class="highlighted && entryFor(widget)?.current?.queueNumber === highlighted ? 'animate-pulse' : ''"
          >
            {{ entryFor(widget)?.current?.queueNumber ?? (preview ? 'A023' : '—') }}
          </p>
          <p
            v-if="widget.config?.showCounter !== false"
            class="w-full truncate opacity-80"
            :style="{ fontSize: '0.2em' }"
          >
            {{ entryFor(widget)?.current?.counter?.name ?? (preview ? 'Loket 1' : '') }}
          </p>
        </template>

        <!-- Nomor antrean + isian formulir pengunjungnya -->
        <template v-else-if="widget.type === 'VISITOR_INFO'">
          <p
            v-if="isPriorityQueue(entryFor(widget)?.current?.priority)"
            data-priority-badge
            class="w-full truncate font-extrabold uppercase tracking-[0.2em] text-amber-400"
            :style="{ fontSize: '0.2em' }"
          >
            ★ {{ PRIORITY_LABEL }}
          </p>

          <p
            v-if="widget.config?.showQueueNumber !== false"
            class="queue-number w-full truncate leading-none"
            :class="highlighted && entryFor(widget)?.current?.queueNumber === highlighted ? 'animate-pulse' : ''"
          >
            {{ entryFor(widget)?.current?.queueNumber ?? (preview ? 'A023' : '—') }}
          </p>

          <div v-if="visitorFieldsFor(widget).length" class="mt-[0.06em] w-full">
            <p
              v-for="field in visitorFieldsFor(widget)"
              :key="field.key"
              class="w-full truncate"
              :style="{ fontSize: '0.34em' }"
            >
              <span v-if="widget.config?.showLabel !== false" class="opacity-60">{{ field.label }}: </span>{{ field.value }}
            </p>
          </div>

          <p v-else-if="preview" class="w-full truncate opacity-60" :style="{ fontSize: '0.24em' }">
            Pilih isian formulir pada panel properti
          </p>
        </template>

        <!-- Nomor yang sedang dilayani di tiap loket -->
        <template v-else-if="widget.type === 'COUNTER_BOARD'">
          <p
            v-if="widget.config?.showQueueTypeName && entryFor(widget)"
            class="w-full truncate opacity-70"
            :style="{ fontSize: '0.22em' }"
          >
            {{ entryFor(widget)?.queueType.name }}
          </p>

          <div
            v-if="countersFor(widget).length"
            class="grid min-h-0 w-full flex-1"
            :style="{
              gridTemplateColumns: `repeat(${counterColumns(widget)}, minmax(0, 1fr))`,
              gap: '0.1em',
            }"
          >
            <div
              v-for="counter in countersFor(widget)"
              :key="counter.id"
              class="flex h-full flex-col items-center justify-center overflow-hidden rounded-[0.12em] px-[0.06em] py-[0.05em] transition-all duration-500"
              :class="highlighted && counter.current?.queueNumber === highlighted
                ? 'bg-white/20 ring-[0.03em] ring-white'
                : 'bg-white/10'"
            >
              <p class="w-full truncate opacity-70" :style="{ fontSize: '0.26em' }">
                {{ counter.name }}
              </p>
              <p
                class="queue-number w-full truncate leading-none"
                :class="highlighted && counter.current?.queueNumber === highlighted ? 'animate-pulse' : ''"
                :style="counter.current ? undefined : { opacity: 0.35 }"
              >
                {{ counter.current?.queueNumber ?? '—' }}
              </p>
              <!-- Penanda prioritas harus terbaca dari jauh, bukan sekadar warna -->
              <p
                v-if="isPriorityQueue(counter.current?.priority)"
                data-priority-badge
                class="w-full truncate font-extrabold uppercase tracking-[0.15em] text-amber-400"
                :style="{ fontSize: '0.18em' }"
              >
                ★ {{ PRIORITY_LABEL }}
              </p>
              <p
                v-else-if="widget.config?.showService !== false && counter.current?.queueType"
                class="w-full truncate opacity-60"
                :style="{ fontSize: '0.18em' }"
              >
                {{ counter.current.queueType.name }}
              </p>
            </div>
          </div>

          <p v-else class="w-full truncate opacity-60" :style="{ fontSize: '0.22em' }">
            Belum ada loket aktif
          </p>
        </template>

        <!-- Daftar menunggu -->
        <template v-else-if="widget.type === 'QUEUE_LIST'">
          <p class="w-full truncate opacity-70" :style="{ fontSize: '0.5em' }">
            Menunggu · {{ entryFor(widget)?.waitingCount ?? (preview ? 4 : 0) }}
          </p>
          <div class="mt-2 flex w-full flex-col gap-1">
            <span
              v-for="number in (entryFor(widget)?.nextNumbers ?? (preview ? ['A024', 'A025', 'A026'] : [])).slice(0, Number(widget.config?.limit ?? 5))"
              :key="number"
              class="queue-number w-full truncate"
            >
              {{ number }}
            </span>
          </div>
        </template>

        <!-- Jam & tanggal -->
        <p v-else-if="widget.type === 'CLOCK'" class="w-full tabular-nums">
          {{ widget.config?.showSeconds === false ? timeTextShort : timeText }}
        </p>
        <p v-else-if="widget.type === 'DATE'" class="w-full truncate">
          {{ dateText }}
        </p>
        <p v-else-if="widget.type === 'ORG_NAME'" class="w-full truncate">
          {{ organizationName ?? (preview ? 'Demo Organization' : '') }}
        </p>

        <!-- Teks -->
        <p v-else-if="widget.type === 'TEXT'" class="w-full whitespace-pre-line">
          {{ widget.config?.text ?? '' }}
        </p>

        <!-- Teks berjalan & pengumuman -->
        <div
          v-else-if="widget.type === 'RUNNING_TEXT' || widget.type === 'ANNOUNCEMENT'"
          class="relative flex w-full items-center overflow-hidden"
        >
          <div class="animate-[display-marquee_28s_linear_infinite] whitespace-nowrap">
            {{ widget.type === 'ANNOUNCEMENT' ? runningText : (widget.config?.text ?? runningText) }}
          </div>
        </div>

        <!-- Media -->
        <img
          v-else-if="(widget.type === 'IMAGE' || widget.type === 'LOGO') && mediaOf(widget)"
          :src="mediaOf(widget)!.url"
          alt=""
          class="size-full"
          :class="objectFit(widget)"
        >
        <video
          v-else-if="widget.type === 'VIDEO' && mediaOf(widget)"
          :src="mediaOf(widget)!.url"
          class="size-full"
          :class="objectFit(widget)"
          autoplay
          muted
          playsinline
          :loop="widget.config?.loop !== false"
        />

        <!-- Playlist -->
        <template v-else-if="widget.type === 'PLAYLIST'">
          <img
            v-if="playlistItemFor(widget)?.media.type === 'IMAGE'"
            :src="playlistItemFor(widget)!.media.url"
            alt=""
            class="size-full"
            :class="objectFit(widget)"
          >
          <video
            v-else-if="playlistItemFor(widget)?.media.type === 'VIDEO'"
            :src="playlistItemFor(widget)!.media.url"
            class="size-full"
            :class="objectFit(widget)"
            autoplay
            muted
            playsinline
            loop
          />
          <div v-else class="flex size-full items-center justify-center text-slate-500" :style="{ fontSize: '0.4em' }">
            Playlist kosong
          </div>
        </template>

        <!-- QR -->
        <div v-else-if="widget.type === 'QRCODE'" class="flex size-full flex-col items-center justify-center gap-2">
          <img v-if="qrUrl" :src="qrUrl" alt="QR" class="h-full w-auto max-w-full rounded bg-white p-1">
          <div v-else class="flex size-full items-center justify-center rounded bg-white/10" :style="{ fontSize: '0.35em' }">
            QR
          </div>
        </div>

        <!-- Media belum dipilih -->
        <div v-else class="flex size-full items-center justify-center rounded border-2 border-dashed border-white/25 text-white/50" :style="{ fontSize: '0.35em' }">
          {{ widget.type }}
        </div>
      </div>
    </div>
  </div>
</template>

<style>
@keyframes display-marquee {
  0% { transform: translateX(100%); }
  100% { transform: translateX(-100%); }
}
</style>
