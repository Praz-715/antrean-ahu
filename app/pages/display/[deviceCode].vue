<script setup lang="ts">
import { SYSTEM_TONES } from '#shared/constants/tones'
import { apiFetch } from '../../composables/useApi'
import { SOCKET_EVENTS } from '#shared/constants/socket'
import { PRIORITY_LABEL, isPriorityQueue } from '#shared/constants/queue'
import { announcementText } from '../../composables/useSpeech'

definePageMeta({ layout: false })

const route = useRoute()
const deviceCode = route.params.deviceCode as string

/**
 * Papan display GELAP secara bawaan, bukan mengikuti tema sistem.
 *
 * Layar antrean dipasang di ruang tunggu dan dibaca dari jauh; latar gelap dengan
 * nomor berwarna besar jauh lebih terbaca, dan itulah tampilan yang sudah dipakai
 * perangkat di lapangan. Perangkat TV tidak pernah memilih tema sendiri, jadi
 * tampilannya tidak berubah — hanya yang menekan sakelar tema dan memilih "terang"
 * yang mendapat papan terang. Kelas `dark` ditempel pada akar halaman ini sendiri
 * supaya varian `dark:` tetap berlaku walau `<html>` tidak bertanda gelap.
 *
 * Nilainya TIDAK dibaca dari `colorMode.preference` saat render: saat hidrasi,
 * state itu masih berisi nilai bawaan (`system`) walaupun localStorage sudah berisi
 * `light` — terbukti papan tetap gelap sesudah muat ulang. Jadi pilihan tersimpan
 * dibaca langsung sesudah terpasang, lalu perubahan berikutnya diikuti lewat watch.
 */
const colorMode = useColorMode()
/** Kunci penyimpanan bawaan @nuxtjs/color-mode. */
const COLOR_MODE_KEY = 'nuxt-color-mode'

/**
 * Gelap secara bawaan; jadi terang HANYA bila pengguna memang memilih terang.
 *
 * Pilihan tema dibaca dari penyimpanan sesudah komponen terpasang, bukan dari
 * `colorMode.preference` saat render: pada saat hidrasi state itu masih berisi nilai
 * bawaan walau localStorage sudah berisi "light". Perubahan sesudahnya (pengguna
 * menekan sakelar tema di layar ini) diikuti lewat watch.
 */
const boardDark = ref(true)
const boardRoot = ref<HTMLElement | null>(null)

onMounted(() => {
  boardDark.value = window.localStorage.getItem(COLOR_MODE_KEY) !== 'light'
})

watch(() => colorMode.preference, (pref) => {
  if (pref === 'light' || pref === 'dark') boardDark.value = pref === 'dark'
})

/**
 * Kelas `dark` ditulis LANGSUNG ke elemen akar, bukan lewat `:class`.
 *
 * Kelas terikat sudah dicoba dan hasilnya salah: sesudah muat ulang, nilainya sudah
 * "terang" (terbukti dari atribut lain pada elemen yang sama) tetapi kelas `dark`
 * warisan render server tidak pernah dilepas, sehingga papan tetap gelap. Karena
 * kelasnya statis di template, Vue tidak pernah menambalnya lagi — jadi penulisan
 * langsung ini aman dan tidak akan saling menimpa. Render server tetap gelap,
 * sehingga layar tidak berkedip putih saat perangkat menyala.
 */
watch(boardDark, (dark) => {
  boardRoot.value?.classList.toggle('dark', dark)
}, { flush: 'post' })
const TOKEN_KEY = `antrean:display-token:${deviceCode}`

interface BoardEntry {
  queueType: { id: string, code: string, name: string, color: string, icon: string | null }
  current: {
    queueNumber: string
    status: string
    recallCount: number
    priority: number
    lastCalledAt: string | null
    counter: { code: string, name: string } | null
  } | null
  waitingCount: number
  nextNumbers: string[]
  lastCompleted: string | null
}

interface TemplateWidget {
  id: string
  type: string
  x: number
  y: number
  width: number
  height: number
  zIndex: number
  isVisible: boolean
  animation: string | null
  config: Record<string, unknown> | null
  style: Record<string, unknown> | null
  mediaId: string | null
  playlistId: string | null
}

/** Satu loket pada papan display, beserta nomor yang sedang dilayaninya. */
interface CounterBoardEntry {
  id: string
  code: string
  name: string
  services: Array<{ id: string, code: string, name: string, color: string }>
  current: {
    queueNumber: string
    status: string
    priority: number
    lastCalledAt: string | null
    queueType: { id: string, code: string, name: string, color: string } | null
  } | null
}

interface DisplayState {
  device: { id: string, deviceCode: string, name: string, type: string, queueType: { id: string, code: string, name: string, color: string } | null, isPaired: boolean }
  event: { id: string, name: string, timezone: string, status: string }
  organization: { name: string, logoUrl: string | null } | null
  branding: { primaryColor?: string, secondaryColor?: string } | null
  serviceDate: string
  settings: {
    voiceEnabled: boolean
    voiceLanguage: string
    /** 'browser' = suara peramban, 'external' = TTS lewat proxy server. */
    voiceProvider: string
    /** Berkas nada panggil, sudah berupa URL siap putar (null bila tidak diatur). */
    voiceChimeUrl: string | null
  }
  openState: { isOpen: boolean, message: string, openTime: string | null, closeTime: string | null }
  board: BoardEntry[]
  counters: CounterBoardEntry[]
  announcements: Array<{ id: string, title: string | null, message: string, type: string }>
  template: { id: string, name: string, background: { color?: string, imageUrl?: string } | null, widgets: TemplateWidget[] } | null
  mediaById: Record<string, { url: string, type: string }>
  playlistById: Record<string, { items: Array<{ media: { url: string, type: string }, durationSeconds: number }> }>
}

const state = ref<DisplayState | null>(null)
const loadError = ref('')
const deviceToken = ref<string | null>(null)

async function loadState() {
  try {
    state.value = await apiFetch<DisplayState>(`/api/display/${deviceCode}/state`)
    loadError.value = ''
  }
  catch (e) {
    loadError.value = (e as Error).message
  }
}

await loadState()

useHead(() => ({ title: state.value?.device.name ?? 'Display' }))

/**
 * Pairing (§45) harus tuntas sebelum socket dibuka: begitu perangkat punya
 * device token, server menolak handshake yang tidak menyertakannya.
 */
async function ensurePaired() {
  deviceToken.value = localStorage.getItem(TOKEN_KEY)
  if (deviceToken.value || !state.value || state.value.device.isPaired) return

  try {
    const res = await apiFetch<{ deviceToken: string }>(`/api/display/${deviceCode}/pair`, { method: 'POST' })
    deviceToken.value = res.deviceToken
    localStorage.setItem(TOKEN_KEY, res.deviceToken)
  }
  catch { /* sudah dipasangkan di browser lain — tetap boleh menampilkan lewat polling */ }
}

/**
 * Jam layar.
 *
 * Waktu acuannya ikut terkirim dari server (lihat `useNow`) supaya detik yang
 * dirender server dan yang dihidrasi klien sama — kalau tidak, Vue melaporkan
 * mismatch hidrasi dan membuang DOM yang sudah tergambar. Berdetak tiap detik,
 * jadi memakai kunci state sendiri.
 */
const now = useNow({ intervalMs: 1000, key: 'antrean:display-clock' })

const timeText = computed(() =>
  new Date(now.value).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }))
const dateText = computed(() =>
  new Date(now.value).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))

// ---- realtime + suara ----
const speech = useSpeech({ language: 'id-ID', repeat: 2 })

/**
 * Suara diatur terpusat lewat pengaturan sistem (§49), bukan per layar: seorang
 * admin mematikan suara sekali dan seluruh perangkat mengikuti pada pembaruan
 * status berikutnya — tanpa perlu mendatangi tiap televisi.
 */
watchEffect(() => {
  if (!state.value?.settings) return
  speech.settings.enabled = state.value.settings.voiceEnabled
  speech.settings.language = state.value.settings.voiceLanguage
})
const callSound = useCallSound()
const highlighted = ref<string | null>(null)
const audioUnlocked = ref(false)

/**
 * Bunyikan panggilan: nada panggil dulu, baru suaranya.
 *
 * Sumber suaranya mengikuti pengaturan (yang boleh ditimpa per event): suara peramban,
 * atau TTS eksternal yang diambil lewat endpoint server sendiri. Bila TTS eksternal
 * gagal — layanannya mati, URL-nya salah — layar TIDAK diam saja, melainkan jatuh ke
 * suara peramban. Layar antrean yang bisu jauh lebih merugikan daripada suara yang
 * kurang bagus.
 */
let urutanPanggilan = 0

async function announceCall(payload: CallPayload, priority: boolean) {
  const settings = state.value?.settings
  if (!settings?.voiceEnabled) return

  /**
   * Hanya panggilan TERBARU yang boleh bersuara.
   *
   * Operator sering menekan panggil beberapa kali beruntun, dan tiap pengumuman
   * menunggu berkasnya selesai. Tanpa nomor urut ini, pengumuman lama melanjutkan
   * sisa langkahnya setelah yang baru mulai — hasilnya dua suara bertumpuk.
   */
  const saya = ++urutanPanggilan
  const masihTerbaru = () => saya === urutanPanggilan

  // Ucapan peramban dari panggilan sebelumnya dihentikan, bukan dibiarkan mengantre.
  speech.cancel()

  const adaNada = !!settings.voiceChimeUrl
  if (adaNada) {
    const hasilNada = await callSound.play(settings.voiceChimeUrl!, { timeoutMs: 8000 })
    if (hasilNada === 'diganti' || !masihTerbaru()) return
  }

  /**
   * "Hanya nada panggil" berarti nomornya TIDAK dibacakan — nada tadi sudah selesai
   * bertugas. Tetapi kalau nadanya belum diatur, layar tidak dibiarkan bisu: lebih
   * baik terdengar suara peramban daripada panggilan yang tidak berbunyi sama sekali.
   */
  if (settings.voiceProvider === 'chime' && adaNada) return

  const teks = announcementText({
    queueNumber: payload.queueNumber,
    queueTypeName: payload.queueTypeName,
    counterName: payload.counterName,
    priority,
  })

  /**
   * Google Translate dan TTS eksternal sama-sama diambil lewat endpoint server
   * sendiri — layar tidak pernah menghubungi layanan luar langsung.
   */
  if (settings.voiceProvider === 'external' || settings.voiceProvider === 'gtranslate') {
    const url = `/api/display/${deviceCode}/tts?text=${encodeURIComponent(teks)}`
    const hasil = await callSound.play(url, { timeoutMs: 12_000 })

    // Selesai: sudah terdengar. Diganti: panggilan lain yang memegang audio sekarang.
    // Hanya kegagalan sungguhan yang boleh jatuh ke suara peramban.
    if (hasil !== 'gagal') return
  }

  if (!masihTerbaru()) return
  speech.speak(teks)
}

// auth dibaca sebagai fungsi supaya token terbaru ikut terkirim saat connect()
const { connected, rejected, lastError, lastMessageAt, on, emit, connect } = useSocket(
  () => ({
    role: 'display' as const,
    deviceCode,
    deviceToken: deviceToken.value ?? undefined,
  }),
  { manual: true },
)

interface CallPayload {
  queueNumber: string
  queueTypeId: string
  queueTypeName: string
  counterName: string | null
  priority?: number
}

/**
 * Nomor prioritas ditandai dua kali: dari siaran (supaya sorotannya muncul
 * seketika) dan dari papan hasil `loadState()` (supaya penandanya tetap ada
 * setelah layar dimuat ulang atau saat jatuh ke polling).
 */
const priorityCall = ref<string | null>(null)

function onCalled(payload: CallPayload) {
  highlighted.value = payload.queueNumber
  const priority = isPriorityQueue(payload.priority)
  priorityCall.value = priority ? payload.queueNumber : null

  void announceCall(payload, priority)
  setTimeout(() => {
    if (highlighted.value === payload.queueNumber) highlighted.value = null
    if (priorityCall.value === payload.queueNumber) priorityCall.value = null
  }, 12_000)
  void loadState()
}

/** Nomor yang sedang dipanggil pada satu layanan sedang berprioritas? */
function isPriorityEntry(entry: BoardEntry) {
  return isPriorityQueue(entry.current?.priority)
    || (!!entry.current && priorityCall.value === entry.current.queueNumber)
}

on<CallPayload>(SOCKET_EVENTS.QUEUE_CALLED, onCalled)
on<CallPayload>(SOCKET_EVENTS.QUEUE_RECALLED, onCalled)
on(SOCKET_EVENTS.QUEUE_CREATED, () => loadState())
on(SOCKET_EVENTS.QUEUE_COMPLETED, () => loadState())
on(SOCKET_EVENTS.QUEUE_SKIPPED, () => loadState())
on(SOCKET_EVENTS.EVENT_OPENED, () => loadState())
on(SOCKET_EVENTS.EVENT_CLOSED, () => loadState())
on(SOCKET_EVENTS.EVENT_PAUSED, () => loadState())
on(SOCKET_EVENTS.ANNOUNCEMENT_CREATED, () => loadState())
on(SOCKET_EVENTS.DISPLAY_UPDATED, () => loadState())
on(SOCKET_EVENTS.DISPLAY_RELOAD, () => window.location.reload())

// Fallback polling saat WebSocket terputus (§44), plus heartbeat saat tersambung.
let pollTimer: ReturnType<typeof setInterval> | undefined

onMounted(async () => {
  await ensurePaired()
  connect()

  pollTimer = setInterval(() => {
    if (connected.value) emit('display:ping')
    else void loadState()
  }, 10_000)
})
onBeforeUnmount(() => clearInterval(pollTimer))

/**
 * Layar penuh (§17).
 *
 * Ditekan sekali saat perangkat dipasang; sesudahnya bilah alamat peramban tidak
 * lagi memakan ruang yang seharusnya menjadi nomor antrean.
 */
const { isFullscreen, supported: fullscreenSupported, toggle: toggleFullscreen } = useFullscreen()

/** Browser memblokir suara sampai ada interaksi pengguna — sediakan satu tombol. */
async function unlockAudio() {
  speech.speak('Pengumuman suara aktif.', 1)

  /**
   * Elemen audio punya izinnya sendiri, dan izin itu melekat pada ELEMEN — bukan
   * pada berkasnya. Karena itu ia harus disentuh sekali di sini apa pun setelannya.
   *
   * Sebelumnya hanya nada panggil yang dipakai membukanya, sehingga event yang
   * memakai TTS (Google Translate atau layanan sendiri) TANPA nada panggil tidak
   * pernah mendapat izin — panggilannya selalu jatuh diam-diam ke suara peramban.
   * Bila nadanya kosong, nada bawaan sistem yang dipakai sebagai pembuka; diputar
   * tanpa volume, jadi tidak terdengar siapa pun. Berkas hening berbentuk `data:`
   * tidak bisa dipakai karena CSP hanya mengizinkan media dari origin sendiri.
   */
  await callSound.unlock(state.value?.settings?.voiceChimeUrl ?? SYSTEM_TONES[0]!.url)
  audioUnlocked.value = true
}

/**
 * Nada panggil yang BARU dipilih admin ikut disiapkan tanpa menunggu ketukan lagi.
 *
 * Urutan yang sangat mungkin terjadi di lapangan: layar dinyalakan dan tombol
 * "Aktifkan Suara" ditekan pagi-pagi, nadanya baru dipasang admin siang hari. Tanpa
 * ini, elemen audio belum pernah menyentuh berkas itu dan panggilan pertama bisa
 * tersendat. Diputar tanpa volume, jadi tidak terdengar siapa pun.
 */
watch(() => state.value?.settings?.voiceChimeUrl, (url) => {
  if (url && audioUnlocked.value) void callSound.unlock(url)
})

/** Tombol buka-suara tidak ada gunanya bila suara memang dimatikan admin. */
const voiceEnabled = computed(() => state.value?.settings?.voiceEnabled !== false)

const primary = computed(() => state.value?.branding?.primaryColor ?? '#1b5cf5')

/** Template kustom mengambil alih seluruh layar; tanpa itu dipakai tata letak bawaan. */
const useTemplate = computed(() => (state.value?.template?.widgets?.length ?? 0) > 0)
const isSingle = computed(() => state.value?.board.length === 1)
const runningText = computed(() =>
  state.value?.announcements.map(a => a.message).join('   •   ') ?? '')

function lastUpdateText() {
  if (!lastMessageAt.value) return 'Menunggu pembaruan'
  return 'Pembaruan terakhir ' + lastMessageAt.value.toLocaleTimeString('id-ID')
}
</script>

<template>
  <div
    ref="boardRoot"
    class="dark flex min-h-screen flex-col bg-white text-slate-900 dark:bg-slate-950 dark:text-white"
  >
    <div v-if="loadError" class="flex flex-1 items-center justify-center">
      <div class="text-center">
        <UIcon name="i-lucide-monitor-x" class="mx-auto size-16 text-slate-400 dark:text-slate-600" />
        <p class="mt-4 text-2xl font-bold">
          Display tidak ditemukan
        </p>
        <p class="mt-2 text-slate-500 dark:text-slate-400">
          {{ loadError }}
        </p>
      </div>
    </div>

    <!-- Tata letak dari Display Builder mengambil alih seluruh layar -->
    <template v-else-if="state && useTemplate">
      <DisplayRenderer
        class="flex-1"
        :widgets="state.template!.widgets as never"
        :background="state.template!.background"
        :board="state.board as never"
        :counters="state.counters as never"
        :organization-name="state.organization?.name ?? state.event.name"
        :announcements="state.announcements"
        :media-by-id="state.mediaById"
        :playlist-by-id="state.playlistById"
        :highlighted="highlighted"
      />

      <!-- Baris status tetap ada supaya perangkat tetap bisa dipantau -->
      <footer class="flex items-center gap-4 border-t border-slate-200 bg-slate-100 px-6 py-2 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900">
        <span class="flex items-center gap-1.5">
          <span class="size-1.5 rounded-full" :class="connected ? 'animate-pulse bg-emerald-400' : 'bg-rose-400'" />
          {{ connected ? 'ONLINE' : rejected ? 'PERLU PAIRING ULANG' : 'OFFLINE' }}
        </span>
        <span>{{ state.openState.isOpen ? 'BUKA' : 'TUTUP' }}</span>
        <button
          v-if="!audioUnlocked && voiceEnabled"
          type="button"
          class="rounded-full bg-slate-900/10 px-3 py-1 font-medium text-slate-700 hover:bg-slate-900/20 dark:bg-white/10 dark:text-white dark:hover:bg-white/20"
          @click="unlockAudio"
        >
          Aktifkan Suara
        </button>
        <button
          v-if="fullscreenSupported"
          type="button"
          class="flex items-center gap-1.5 rounded-full bg-slate-900/10 px-3 py-1 font-medium text-slate-700 hover:bg-slate-900/20 dark:bg-white/10 dark:text-white dark:hover:bg-white/20"
          :aria-label="isFullscreen ? 'Keluar dari layar penuh' : 'Tampilkan layar penuh'"
          :title="isFullscreen ? 'Keluar dari layar penuh' : 'Tampilkan layar penuh'"
          @click="toggleFullscreen"
        >
          <UIcon :name="isFullscreen ? 'i-lucide-minimize' : 'i-lucide-maximize'" class="size-3.5" />
          {{ isFullscreen ? 'Keluar' : 'Layar Penuh' }}
        </button>
        <UiThemeToggle size="xs" />
        <span class="ml-auto truncate">{{ state.device.name }} · {{ lastUpdateText() }}</span>
      </footer>
    </template>

    <template v-else-if="state">
      <!-- Header -->
      <header class="flex items-center gap-6 px-10 py-6" :style="{ backgroundColor: primary }">
        <img
          v-if="state.organization?.logoUrl"
          :src="state.organization.logoUrl"
          alt=""
          class="h-14 w-auto object-contain"
        >
        <div class="min-w-0 flex-1">
          <p class="text-sm font-semibold uppercase tracking-[0.3em] text-white/60">
            Antrean
          </p>
          <h1 class="truncate text-3xl font-extrabold leading-tight">
            {{ state.organization?.name ?? state.event.name }}
          </h1>
        </div>

        <div class="text-right">
          <p class="text-4xl font-bold tabular-nums">
            {{ timeText }}
          </p>
          <p class="text-sm text-white/70">
            {{ dateText }}
          </p>
        </div>

        <div class="flex flex-col items-end gap-1">
          <span
            class="flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold"
            :class="connected ? 'bg-emerald-500/20 text-emerald-100' : 'bg-rose-500/20 text-rose-100'"
          >
            <span class="size-2 rounded-full" :class="connected ? 'animate-pulse bg-emerald-400' : 'bg-rose-400'" />
            {{ connected ? 'ONLINE' : rejected ? 'PERLU PAIRING ULANG' : 'OFFLINE' }}
          </span>
          <span
            class="rounded-full px-3 py-1 text-xs font-semibold"
            :class="state.openState.isOpen ? 'bg-white/20' : 'bg-rose-500/30'"
          >
            {{ state.openState.isOpen ? 'BUKA' : 'TUTUP' }}
          </span>
        </div>
      </header>

      <!-- Papan antrean -->
      <main class="flex-1 p-8">
        <div
          class="grid h-full gap-6"
          :class="isSingle ? 'grid-cols-1' : state.board.length === 2 ? 'grid-cols-2' : 'grid-cols-3'"
        >
          <div
            v-for="entry in state.board"
            :key="entry.queueType.id"
            class="flex flex-col rounded-3xl border-2 bg-slate-50 p-8 transition-all duration-500 dark:bg-slate-900/80"
            :class="[
              highlighted && entry.current?.queueNumber === highlighted
                ? isPriorityEntry(entry)
                  ? 'scale-[1.02] border-amber-400 shadow-[0_0_70px_rgba(251,191,36,0.45)]'
                  : 'scale-[1.02] border-slate-900 shadow-[0_0_60px_rgba(15,23,42,0.18)] dark:border-white dark:shadow-[0_0_60px_rgba(255,255,255,0.25)]'
                : isPriorityEntry(entry) ? 'border-amber-500/60' : 'border-slate-200 dark:border-slate-800',
            ]"
          >
            <div class="mb-4 flex items-center gap-3">
              <span
                class="flex size-12 items-center justify-center rounded-xl text-xl font-extrabold"
                :style="{ backgroundColor: entry.queueType.color + '33', color: entry.queueType.color }"
              >
                {{ entry.queueType.code }}
              </span>
              <h2 class="truncate text-2xl font-bold uppercase tracking-wide">
                {{ entry.queueType.name }}
              </h2>
            </div>

            <div class="flex flex-1 flex-col items-center justify-center">
              <!-- Penanda prioritas: harus terbaca dari jauh, bukan sekadar warna -->
              <p
                v-if="isPriorityEntry(entry)"
                data-priority-badge
                class="mb-2 flex items-center gap-2 rounded-full bg-amber-400 px-4 py-1 text-sm font-extrabold uppercase tracking-[0.2em] text-slate-950"
              >
                <UIcon name="i-lucide-accessibility" class="size-4" />
                {{ PRIORITY_LABEL }}
              </p>
              <p class="text-sm uppercase tracking-[0.3em] text-slate-500 dark:text-slate-400">
                Nomor dilayani
              </p>
              <p
                class="queue-number leading-none"
                :class="[
                  isSingle ? 'text-[14rem]' : 'text-[8rem]',
                  highlighted === entry.current?.queueNumber ? 'animate-pulse' : '',
                ]"
                :style="{ color: entry.current ? entry.queueType.color : (boardDark ? '#334155' : '#cbd5e1') }"
              >
                {{ entry.current?.queueNumber ?? '—' }}
              </p>

              <p v-if="entry.current?.counter" class="mt-4 text-center">
                <span class="block text-sm uppercase tracking-[0.3em] text-slate-500 dark:text-slate-400">Silakan ke</span>
                <span class="text-3xl font-bold">{{ entry.current.counter.name }}</span>
              </p>
              <p v-else class="mt-4 text-slate-500 dark:text-slate-400">
                Menunggu panggilan
              </p>
            </div>

            <div class="mt-6 border-t border-slate-200 pt-4 dark:border-slate-800">
              <div class="flex items-center justify-between text-sm text-slate-500 dark:text-slate-400">
                <span>Menunggu: <b class="text-slate-800 dark:text-slate-200">{{ entry.waitingCount }}</b></span>
                <span v-if="entry.nextNumbers.length" class="truncate">
                  Berikutnya: <b class="text-slate-800 dark:text-slate-200">{{ entry.nextNumbers.slice(0, 3).join(' · ') }}</b>
                </span>
              </div>
            </div>
          </div>

          <div v-if="!state.board.length" class="col-span-full flex items-center justify-center text-slate-500 dark:text-slate-400">
            Belum ada jenis antrean aktif pada event ini.
          </div>
        </div>
      </main>

      <!-- Running text -->
      <footer class="flex items-center gap-6 border-t border-slate-200 bg-slate-100 px-8 py-3 text-sm dark:border-slate-800 dark:bg-slate-900">
        <div v-if="runningText" class="relative flex-1 overflow-hidden">
          <div class="animate-[marquee_28s_linear_infinite] whitespace-nowrap text-slate-700 dark:text-slate-300">
            {{ runningText }}
          </div>
        </div>
        <div v-else class="flex-1 truncate text-slate-500 dark:text-slate-400">
          {{ state.openState.message }}
        </div>

        <button
          v-if="!audioUnlocked && voiceEnabled"
          type="button"
          class="flex items-center gap-2 rounded-full bg-slate-900/10 px-4 py-1.5 font-medium text-slate-700 hover:bg-slate-900/20 dark:bg-white/10 dark:text-white dark:hover:bg-white/20"
          @click="unlockAudio"
        >
          <UIcon name="i-lucide-volume-2" class="size-4" />
          Aktifkan Suara
        </button>

        <button
          v-if="fullscreenSupported"
          type="button"
          class="flex shrink-0 items-center gap-2 rounded-full bg-slate-900/10 px-4 py-1.5 font-medium text-slate-700 hover:bg-slate-900/20 dark:bg-white/10 dark:text-white dark:hover:bg-white/20"
          :aria-label="isFullscreen ? 'Keluar dari layar penuh' : 'Tampilkan layar penuh'"
          :title="isFullscreen ? 'Keluar dari layar penuh' : 'Tampilkan layar penuh'"
          @click="toggleFullscreen"
        >
          <UIcon :name="isFullscreen ? 'i-lucide-minimize' : 'i-lucide-maximize'" class="size-4" />
          {{ isFullscreen ? 'Keluar Layar Penuh' : 'Layar Penuh' }}
        </button>

        <UiThemeToggle size="xs" />

        <span class="whitespace-nowrap text-xs text-slate-500 dark:text-slate-400">
          {{ state.device.name }} · {{ lastUpdateText() }}
          <template v-if="rejected"> · {{ lastError }} — reset pairing dari panel admin</template>
        </span>
      </footer>
    </template>
  </div>
</template>

<style>
@keyframes marquee {
  0% { transform: translateX(100%); }
  100% { transform: translateX(-100%); }
}
</style>
