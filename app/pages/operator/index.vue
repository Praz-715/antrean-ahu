<script setup lang="ts">
import { signOut } from '../../utils/auth-client'
import { apiFetch } from '../../composables/useApi'
import { QUEUE_STATUS_COLOR, QUEUE_STATUS_LABEL } from '#shared/utils/queue-format'
import { PRIORITY_LABEL, isPriorityQueue } from '#shared/constants/queue'
import { SOCKET_EVENTS } from '#shared/constants/socket'

definePageMeta({ layout: false, middleware: 'auth' })
useHead({ title: 'Operator' })

const { me, reset } = useMe()
const { call } = useApi()
// Warna layanan dipilih admin; disesuaikan agar tetap terbaca di tema gelap.
const { readable } = useReadableColor()
const toast = useToast()

interface QueueRow {
  id: string
  queueNumber: string
  status: string
  recallCount: number
  priority: number
  createdAt: string
  calledAt: string | null
  finishedAt: string | null
  visitor?: { fullName: string | null } | null
  operator?: { name: string } | null
}

interface BoardData {
  event: { id: string, name: string, status: string, timezone: string, allowFinishAfterClose: boolean }
  serviceDate: string
  assignment: {
    queueType: { id: string, code: string, name: string, estServiceSeconds: number }
    counter: { id: string, code: string, name: string } | null
  }
  current: (QueueRow & { queueType: { name: string, color: string }, counter: { name: string } | null, visitor: { fullName: string | null, phone: string | null, data: unknown } | null }) | null
  waiting: QueueRow[]
  skipped: QueueRow[]
  history: QueueRow[]
  stats: { waiting: number, completed: number, skipped: number, total: number }
}

interface Assignment {
  id: string
  isDefault: boolean
  queueType: { id: string, code: string, name: string, color: string, icon: string | null }
  counter: { id: string, code: string, name: string } | null
  event: { id: string, name: string, status: string }
}

const assignments = ref<Assignment[]>(await apiFetch<Assignment[]>('/api/operator/workspace'))
const activeTypeId = ref<string | null>(assignments.value[0]?.queueType.id ?? null)
const board = ref<BoardData | null>(null)
const loading = ref(false)
const acting = ref<string | null>(null)

async function loadBoard() {
  if (!activeTypeId.value) return
  loading.value = true
  try {
    board.value = await apiFetch<BoardData>('/api/operator/board', { query: { queueTypeId: activeTypeId.value } })
  }
  finally {
    loading.value = false
  }
}

await loadBoard()
watch(activeTypeId, loadBoard)

// ---- suara & realtime ----

/**
 * Panel operator bisa ikut membacakan nomor, tetapi BAWAANNYA mati.
 *
 * Layar antreanlah yang bertugas mengumumkan. Bila panel ini juga bersuara —
 * dan operator biasanya duduk di ruangan yang sama dengan layarnya — satu panggilan
 * terdengar dua kali, dengan dua mesin suara berbeda pula bila layarnya memakai TTS.
 * Yang membutuhkannya (loket tanpa layar) cukup menyalakan sekali; pilihannya
 * diingat di peramban ini.
 */
const SUARA_OPERATOR = 'antrean:operator:suara'
const speech = useSpeech({ language: 'id-ID', repeat: 1, enabled: false })

onMounted(() => {
  try {
    speech.settings.enabled = window.localStorage.getItem(SUARA_OPERATOR) === '1'
  }
  catch {
    // Penyimpanan diblokir peramban — biarkan mati, operator bisa menyalakannya lagi.
  }
})

watch(() => speech.settings.enabled, (nyala) => {
  try {
    window.localStorage.setItem(SUARA_OPERATOR, nyala ? '1' : '0')
  }
  catch { /* sama seperti di atas: tidak fatal */ }
})
const { connected, on } = useSocket({ role: 'operator' })

on(SOCKET_EVENTS.QUEUE_CREATED, () => loadBoard())
on(SOCKET_EVENTS.QUEUE_CALLED, () => loadBoard())
on(SOCKET_EVENTS.QUEUE_SKIPPED, () => loadBoard())
on(SOCKET_EVENTS.QUEUE_COMPLETED, () => loadBoard())
on(SOCKET_EVENTS.QUEUE_CANCELLED, () => loadBoard())

// ---- aksi ----
const confirmAction = ref<{ label: string, run: () => Promise<void> } | null>(null)

async function runAction(key: string, fn: () => Promise<unknown>) {
  if (acting.value) return
  acting.value = key
  try { await fn() }
  finally { acting.value = null }
}

async function next() {
  await runAction('next', async () => {
    const result = await call<BoardData['current']>(
      '/api/operator/queue/next',
      { method: 'POST', body: { queueTypeId: activeTypeId.value, counterId: currentAssignment.value?.counter?.id ?? null } },
    )
    if (result) {
      speech.announceQueue({
        queueNumber: result.queueNumber,
        queueTypeName: board.value?.assignment.queueType.name,
        counterName: currentAssignment.value?.counter?.name ?? null,
      })
    }
    await loadBoard()
  })
}

async function act(queueId: string, action: string, successMessage?: string) {
  await runAction(action + queueId, async () => {
    await call(`/api/operator/queue/${queueId}/${action}`, { method: 'POST', body: {} }, successMessage)
    await loadBoard()
  })
}

async function recall() {
  const current = board.value?.current
  if (!current) return
  await runAction('recall', async () => {
    const result = await call<{ queueNumber: string }>(`/api/operator/queue/${current.id}/recall`, { method: 'POST', body: {} })
    if (result) {
      speech.announceQueue({
        queueNumber: current.queueNumber,
        queueTypeName: board.value?.assignment.queueType.name,
        counterName: current.counter?.name ?? null,
      })
      toast.add({ title: `Memanggil ulang ${current.queueNumber}`, color: 'info', icon: 'i-lucide-megaphone' })
    }
    await loadBoard()
  })
}

/**
 * Panggil satu nomor tertentu.
 *
 * `priority` memanggil sekaligus mencatatnya sebagai antrean prioritas: layar
 * menampilkan penanda khusus, suara menyebutkannya lebih dulu, dan penandaannya
 * tersimpan di riwayat serta ekspor.
 */
async function callSpecific(queueId: string, options: { priority?: boolean } = {}) {
  await runAction((options.priority ? 'priority' : 'call') + queueId, async () => {
    const result = await call<{ queueNumber: string }>(
      `/api/operator/queue/${queueId}/call`,
      {
        method: 'POST',
        body: {
          counterId: currentAssignment.value?.counter?.id ?? null,
          ...(options.priority ? { priority: true } : {}),
        },
      },
    )
    if (result) {
      speech.announceQueue({
        queueNumber: result.queueNumber,
        queueTypeName: board.value?.assignment.queueType.name,
        counterName: currentAssignment.value?.counter?.name ?? null,
        priority: options.priority,
      })
    }
    await loadBoard()
  })
}

const currentAssignment = computed(() => assignments.value.find(a => a.queueType.id === activeTypeId.value) ?? null)

function askConfirm(label: string, run: () => Promise<void>) {
  confirmAction.value = { label, run }
}

/**
 * NEXT menutup antrean yang sedang berjalan sebagai SELESAI. Operator harus tahu
 * itu sebelum menekannya — kalau pengunjung tidak datang, tombol yang benar
 * adalah "Tidak Hadir" atau "Lewati".
 */
function askNext() {
  const current = board.value?.current
  if (!current) return next()
  askConfirm(
    `${current.queueNumber} akan ditandai SELESAI, lalu antrean berikutnya dipanggil. `
    + 'Jika pengunjung tidak datang, pakai "Tidak Hadir" atau "Lewati".',
    next,
  )
}

// ---- pembatalan dengan alasan ----
const cancelTarget = ref<BoardData['current']>(null)
const cancelReason = ref('')
const cancelling = ref(false)

async function confirmCancel() {
  const target = cancelTarget.value
  if (!target) return
  cancelling.value = true
  await call(
    `/api/operator/queue/${target.id}/cancel`,
    { method: 'POST', body: { reason: cancelReason.value || undefined } },
    `Antrean ${target.queueNumber} dibatalkan`,
  )
  cancelling.value = false
  cancelTarget.value = null
  cancelReason.value = ''
  await loadBoard()
}

async function proceedConfirm() {
  const action = confirmAction.value
  confirmAction.value = null
  if (action) await action.run()
}

// ---- pintasan papan tik ----
function onKey(e: KeyboardEvent) {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
  const key = e.key.toLowerCase()
  if (key === 'n') { e.preventDefault(); askNext() }
  if (key === 'r' && board.value?.current) { e.preventDefault(); void recall() }
  if (key === 'm' && board.value?.current?.status === 'CALLED') {
    e.preventDefault()
    void act(board.value.current.id, 'serving', 'Mulai melayani')
  }
  if (key === 's' && board.value?.current) {
    e.preventDefault()
    askConfirm(`Lewati ${board.value.current.queueNumber}?`, () => act(board.value!.current!.id, 'skip', 'Antrean dilewati'))
  }
  if (key === 'c' && board.value?.current) {
    e.preventDefault()
    void act(board.value.current.id, 'complete', 'Antrean selesai')
  }
}

onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))

async function onSignOut() {
  await signOut()
  reset()
  await navigateTo('/login')
}

function timeOf(value: string | null) {
  if (!value) return '–'
  return new Date(value).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
}
</script>

<template>
  <div class="min-h-screen bg-slate-100 dark:bg-slate-950">
    <!-- Topbar -->
    <header class="sticky top-0 z-20 border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
      <div class="mx-auto flex max-w-6xl flex-wrap items-center gap-3">
        <UIcon name="i-lucide-headset" class="size-6 text-brand-600" />
        <div class="min-w-0">
          <p class="truncate font-bold leading-tight">
            {{ board?.assignment.queueType.name ?? 'Operator' }}
          </p>
          <p class="truncate text-xs text-slate-500">
            {{ me?.user.name }} · {{ currentAssignment?.counter?.name ?? 'Tanpa loket' }} · {{ board?.serviceDate }}
          </p>
        </div>

        <div class="ml-auto flex items-center gap-2">
          <span
            class="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
            :class="connected
              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
              : 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300'"
          >
            <span class="size-1.5 rounded-full" :class="connected ? 'bg-emerald-500' : 'bg-rose-500'" />
            {{ connected ? 'Terhubung' : 'Terputus' }}
          </span>

          <UButton
            :icon="speech.settings.enabled ? 'i-lucide-volume-2' : 'i-lucide-volume-x'"
            variant="ghost"
            color="neutral"
            :aria-label="speech.settings.enabled ? 'Matikan suara panggilan' : 'Nyalakan suara panggilan'"
            :title="speech.settings.enabled
              ? 'Matikan suara di panel ini (layar antrean tetap mengumumkan)'
              : 'Bacakan juga nomornya di panel ini — untuk loket tanpa layar antrean'"
            @click="speech.settings.enabled = !speech.settings.enabled"
          />
          <UButton icon="i-lucide-refresh-cw" aria-label="Muat ulang papan antrean" title="Muat ulang papan antrean" variant="ghost" color="neutral" :loading="loading" @click="loadBoard" />
          <UiThemeToggle />
          <UDropdownMenu
            :items="[
              [{ label: me?.user.name ?? '', type: 'label' as const }],
              [{ label: 'Panel admin', icon: 'i-lucide-layout-dashboard', to: '/admin/dashboard' }],
              [{ label: 'Keluar', icon: 'i-lucide-log-out', color: 'error' as const, onSelect: onSignOut }],
            ]"
          >
            <UButton icon="i-lucide-user" aria-label="Menu akun" title="Menu akun" variant="ghost" color="neutral" />
          </UDropdownMenu>
        </div>
      </div>

      <!-- Pemilih layanan bila operator memegang lebih dari satu -->
      <div v-if="assignments.length > 1" class="mx-auto mt-3 flex max-w-6xl gap-2 overflow-x-auto">
        <button
          v-for="a in assignments"
          :key="a.id"
          type="button"
          class="shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
          :class="a.queueType.id === activeTypeId
            ? 'bg-brand-600 text-white'
            : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'"
          @click="activeTypeId = a.queueType.id"
        >
          {{ a.queueType.code }} · {{ a.queueType.name }}
        </button>
      </div>
    </header>

    <main v-if="!assignments.length" class="mx-auto max-w-md px-4 py-20 text-center">
      <UIcon name="i-lucide-inbox" class="mx-auto size-12 text-slate-400" />
      <h1 class="mt-4 text-lg font-bold">
        Belum ada penugasan
      </h1>
      <p class="mt-2 text-slate-500">
        Administrator belum menugaskan Anda ke jenis antrean mana pun.
      </p>
    </main>

    <main v-else-if="board" class="mx-auto max-w-6xl p-4">
      <div class="grid gap-4 lg:grid-cols-3">
        <!-- Panel utama -->
        <section class="lg:col-span-2">
          <div class="rounded-2xl border border-slate-200 bg-white p-6 text-center dark:border-slate-800 dark:bg-slate-900">
            <p class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
              Sedang dilayani
            </p>

            <div v-if="board.current" class="mt-2">
              <p
                class="queue-number text-7xl sm:text-8xl"
                :style="{ color: readable(board.current.queueType.color) }"
              >
                {{ board.current.queueNumber }}
              </p>
              <p class="mt-2 text-lg font-medium">
                {{ board.current.visitor?.fullName || 'Tanpa nama' }}
              </p>
              <div class="mt-1 flex flex-wrap items-center justify-center gap-2 text-sm text-slate-500">
                <UBadge
                  v-if="isPriorityQueue(board.current.priority)"
                  size="sm"
                  color="warning"
                  variant="solid"
                  icon="i-lucide-accessibility"
                  :label="PRIORITY_LABEL"
                />
                <span>Dipanggil {{ timeOf(board.current.calledAt) }}</span>
                <span v-if="board.current.recallCount">· dipanggil ulang {{ board.current.recallCount }}×</span>
                <UBadge
                  size="sm"
                  variant="subtle"
                  :color="(QUEUE_STATUS_COLOR[board.current.status] as never) ?? 'neutral'"
                  :label="QUEUE_STATUS_LABEL[board.current.status]"
                />
              </div>
            </div>

            <div v-else class="py-8">
              <p class="queue-number text-6xl text-slate-300 dark:text-slate-700">
                —
              </p>
              <p class="mt-2 text-slate-500">
                Belum ada antrean yang dipanggil
              </p>
            </div>

            <!-- Tombol aksi -->
            <div class="mt-6 grid gap-3 sm:grid-cols-2">
              <UButton
                size="xl"
                block
                icon="i-lucide-megaphone"
                label="Panggil Ulang"
                variant="outline"
                color="neutral"
                :disabled="!board.current"
                :loading="acting === 'recall'"
                @click="recall"
              />
              <UButton
                size="xl"
                block
                icon="i-lucide-skip-forward"
                label="Lewati"
                color="warning"
                variant="soft"
                :disabled="!board.current"
                :loading="acting?.startsWith('skip')"
                @click="askConfirm(`Lewati antrean ${board.current?.queueNumber}?`, () => act(board!.current!.id, 'skip', 'Antrean dilewati'))"
              />
              <UButton
                size="xl"
                block
                icon="i-lucide-check"
                label="Selesai"
                color="success"
                variant="soft"
                :disabled="!board.current"
                :loading="acting?.startsWith('complete')"
                @click="act(board.current!.id, 'complete', 'Antrean selesai')"
              />
              <UButton
                size="xl"
                block
                icon="i-lucide-arrow-right"
                label="Panggil Berikutnya"
                :disabled="!board.waiting.length"
                :loading="acting === 'next'"
                @click="askNext"
              />
            </div>

            <!-- Aksi sekunder: pengunjung tidak datang / antrean dibatalkan -->
            <div class="mt-3 flex flex-wrap items-center justify-center gap-2">
              <UButton
                v-if="board.current?.status === 'CALLED'"
                size="sm"
                icon="i-lucide-user-check"
                color="info"
                variant="soft"
                label="Mulai Layani"
                :disabled="!board.current"
                :loading="acting?.startsWith('serving')"
                @click="act(board.current!.id, 'serving', 'Mulai melayani')"
              />
              <UButton
                size="sm"
                icon="i-lucide-user-x"
                variant="ghost"
                color="neutral"
                label="Tidak Hadir"
                :disabled="!board.current"
                :loading="acting?.startsWith('no-show')"
                @click="askConfirm(`Tandai ${board.current?.queueNumber} tidak hadir?`, () => act(board!.current!.id, 'no-show', 'Ditandai tidak hadir'))"
              />
              <UButton
                size="sm"
                icon="i-lucide-x-circle"
                variant="ghost"
                color="error"
                label="Batalkan"
                :disabled="!board.current"
                :loading="acting?.startsWith('cancel')"
                @click="cancelTarget = board.current"
              />
            </div>

            <p class="mt-3 text-xs text-slate-400">
              Pintasan: <kbd class="rounded bg-slate-100 px-1 dark:bg-slate-800">N</kbd> berikutnya ·
              <kbd class="rounded bg-slate-100 px-1 dark:bg-slate-800">R</kbd> panggil ulang ·
              <kbd class="rounded bg-slate-100 px-1 dark:bg-slate-800">M</kbd> mulai layani ·
              <kbd class="rounded bg-slate-100 px-1 dark:bg-slate-800">S</kbd> lewati ·
              <kbd class="rounded bg-slate-100 px-1 dark:bg-slate-800">C</kbd> selesai
            </p>
          </div>

          <!-- Statistik -->
          <div class="mt-4 grid grid-cols-4 gap-3">
            <div
v-for="stat in [
              { label: 'Menunggu', value: board.stats.waiting, tone: 'text-amber-600' },
              { label: 'Selesai', value: board.stats.completed, tone: 'text-emerald-600' },
              { label: 'Dilewati', value: board.stats.skipped, tone: 'text-orange-600' },
              { label: 'Total', value: board.stats.total, tone: 'text-slate-600 dark:text-slate-300' },
            ]" :key="stat.label" class="rounded-xl border border-slate-200 bg-white p-3 text-center dark:border-slate-800 dark:bg-slate-900">
              <p class="text-2xl font-bold tabular-nums" :class="stat.tone">
                {{ stat.value }}
              </p>
              <p class="text-xs text-slate-500">
                {{ stat.label }}
              </p>
            </div>
          </div>

          <!-- Riwayat -->
          <div class="mt-4 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <h2 class="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
              Riwayat
            </h2>
            <div v-if="!board.history.length" class="py-6 text-center text-sm text-slate-500">
              Belum ada riwayat hari ini.
            </div>
            <ul v-else class="divide-y divide-slate-100 dark:divide-slate-800">
              <li v-for="row in board.history" :key="row.id" class="flex items-center gap-3 py-2">
                <span class="queue-number w-20 text-lg">{{ row.queueNumber }}</span>
                <span class="min-w-0 flex-1 truncate text-sm text-slate-500">
                  {{ row.visitor?.fullName || 'Tanpa nama' }}
                </span>
                <span class="text-xs text-slate-400">{{ timeOf(row.finishedAt) }}</span>
                <UBadge
                  size="sm"
                  variant="subtle"
                  :color="(QUEUE_STATUS_COLOR[row.status] as never) ?? 'neutral'"
                  :label="QUEUE_STATUS_LABEL[row.status]"
                />
              </li>
            </ul>
          </div>
        </section>

        <!-- Sisi kanan -->
        <aside class="space-y-4">
          <div class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <div class="mb-3 flex items-center justify-between">
              <h2 class="text-sm font-semibold uppercase tracking-wide text-slate-500">
                Menunggu
              </h2>
              <UBadge color="warning" variant="subtle" :label="String(board.stats.waiting)" />
            </div>

            <div v-if="!board.waiting.length" class="py-6 text-center text-sm text-slate-500">
              Tidak ada antrean menunggu.
            </div>
            <ul v-else class="space-y-1">
              <li
                v-for="(row, index) in board.waiting"
                :key="row.id"
                class="flex items-center gap-2 rounded-lg px-2 py-1.5"
                :class="index === 0 ? 'bg-amber-50 dark:bg-amber-950/40' : ''"
              >
                <span class="queue-number w-16 text-lg">{{ row.queueNumber }}</span>
                <span class="min-w-0 flex-1 truncate text-sm text-slate-500">
                  {{ row.visitor?.fullName || '—' }}
                </span>
                <UBadge
                  v-if="isPriorityQueue(row.priority)"
                  size="sm"
                  color="warning"
                  variant="subtle"
                  :label="PRIORITY_LABEL"
                />
                <UButton
                  size="xs"
                  variant="ghost"
                  color="warning"
                  icon="i-lucide-accessibility"
                  aria-label="Panggil sebagai antrean prioritas"
                  title="Panggil sebagai prioritas — lansia, disabilitas, ibu hamil"
                  :loading="acting === 'priority' + row.id"
                  @click="callSpecific(row.id, { priority: true })"
                />
                <UButton
                  size="xs"
                  variant="ghost"
                  color="neutral"
                  icon="i-lucide-megaphone"
                  aria-label="Panggil nomor ini"
                  title="Panggil nomor ini"
                  :loading="acting === 'call' + row.id"
                  @click="callSpecific(row.id)"
                />
              </li>
            </ul>
          </div>

          <div class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <div class="mb-3 flex items-center justify-between">
              <h2 class="text-sm font-semibold uppercase tracking-wide text-slate-500">
                Dilewati
              </h2>
              <UBadge color="warning" variant="subtle" :label="String(board.skipped.length)" />
            </div>

            <div v-if="!board.skipped.length" class="py-6 text-center text-sm text-slate-500">
              Tidak ada antrean yang dilewati.
            </div>
            <ul v-else class="space-y-1">
              <li v-for="row in board.skipped" :key="row.id" class="flex items-center gap-2 rounded-lg px-2 py-1.5">
                <span class="queue-number w-16 text-lg text-orange-600">{{ row.queueNumber }}</span>
                <span class="min-w-0 flex-1 truncate text-sm text-slate-500">
                  {{ row.visitor?.fullName || '—' }}
                </span>
                <UButton
                  size="xs"
                  variant="soft"
                  color="warning"
                  label="Panggil"
                  :loading="acting === 'call' + row.id"
                  @click="callSpecific(row.id)"
                />
              </li>
            </ul>
          </div>
        </aside>
      </div>
    </main>

    <!-- Konfirmasi aksi penting -->
    <UModal
      :open="!!confirmAction"
      title="Konfirmasi"
      :description="confirmAction?.label"
      @update:open="(v) => { if (!v) confirmAction = null }"
    >
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton variant="ghost" color="neutral" label="Batal" @click="confirmAction = null" />
          <UButton color="warning" label="Lanjutkan" @click="proceedConfirm" />
        </div>
      </template>
    </UModal>

    <!-- Pembatalan antrean dengan alasan -->
    <UModal
      :open="!!cancelTarget"
      title="Batalkan antrean"
      :description="`Antrean ${cancelTarget?.queueNumber} akan dibatalkan dan tidak dapat dipanggil lagi.`"
      @update:open="(v) => { if (!v) { cancelTarget = null; cancelReason = '' } }"
    >
      <template #body>
        <UFormField label="Alasan" hint="opsional" help="Tercatat pada riwayat antrean dan audit log.">
          <UInput v-model="cancelReason" class="w-full" placeholder="mis. pengunjung membatalkan sendiri" />
        </UFormField>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton variant="ghost" color="neutral" label="Kembali" @click="cancelTarget = null" />
          <UButton color="error" :loading="cancelling" icon="i-lucide-x-circle" label="Batalkan Antrean" @click="confirmCancel" />
        </div>
      </template>
    </UModal>
  </div>
</template>
