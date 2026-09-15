<script setup lang="ts">
import { apiFetch } from '../../composables/useApi'
import { QUEUE_STATUS_LABEL } from '#shared/utils/queue-format'
import { SOCKET_EVENTS } from '#shared/constants/socket'
import type { TicketPayload } from '#shared/utils/ticket'

definePageMeta({ layout: 'public' })

const route = useRoute()
const token = route.params.token as string

interface TrackData {
  id: string
  queueNumber: string
  status: string
  serviceDate: string
  createdAt: string
  calledAt: string | null
  recallCount: number
  visitorName: string | null
  queueType: { id: string, code: string, name: string, color: string, estServiceSeconds: number }
  counter: { code: string, name: string } | null
  operatorName: string | null
  event: { id: string, name: string, timezone: string, status: string }
  position: { ahead: number, estimateSeconds: number }
  nowServing: { queueNumber: string, counterName: string | null } | null
  ratingEnabled: boolean
  testimonial: { id: string, rating: number, comment: string | null, createdAt: string } | null
}

const { data, refresh, error } = await useAsyncData(`track-${token}`, () =>
  apiFetch<TrackData>(`/api/public/track/${token}`))

useHead(() => ({ title: data.value ? `Antrean ${data.value.queueNumber}` : 'Antrean Anda' }))

const isCalled = computed(() => data.value && ['CALLED', 'SERVING'].includes(data.value.status))
const isFinished = computed(() => data.value && ['COMPLETED', 'CANCELLED', 'NO_SHOW'].includes(data.value.status))
const primary = computed(() => data.value?.queueType.color ?? '#1b5cf5')

// ---- realtime + notifikasi ----
const { connected, on } = useSocket({ role: 'visitor', publicToken: token })
const justCalled = ref(false)

function notifyCalled() {
  justCalled.value = true
  if (import.meta.client) {
    if ('vibrate' in navigator) navigator.vibrate([250, 120, 250])
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('Nomor Anda dipanggil', {
        body: `${data.value?.queueNumber} — silakan menuju ${data.value?.counter?.name ?? data.value?.queueType.name}`,
      })
    }
  }
  setTimeout(() => { justCalled.value = false }, 20_000)
}

on(SOCKET_EVENTS.QUEUE_CALLED, async () => { await refresh(); notifyCalled() })
on(SOCKET_EVENTS.QUEUE_RECALLED, async () => { await refresh(); notifyCalled() })
on(SOCKET_EVENTS.QUEUE_COMPLETED, () => refresh())
on(SOCKET_EVENTS.QUEUE_SKIPPED, () => refresh())
on(SOCKET_EVENTS.QUEUE_UPDATED, () => refresh())

// Fallback polling saat socket terputus (§44)
let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  timer = setInterval(() => { if (!connected.value) void refresh() }, 15_000)
  if ('Notification' in window && Notification.permission === 'default') {
    void Notification.requestPermission()
  }
})
onBeforeUnmount(() => clearInterval(timer))

function estimateText(seconds: number) {
  if (seconds <= 0) return 'Sebentar lagi'
  const minutes = Math.round(seconds / 60)
  return minutes < 1 ? '< 1 menit' : `± ${minutes} menit`
}

const refreshing = ref(false)
async function manualRefresh() {
  refreshing.value = true
  await refresh()
  refreshing.value = false
}

// ---- cetak tiket (§46) ----
/**
 * URL pelacakan disusun dari konfigurasi, BUKAN dari `window.location`.
 *
 * `window` tidak ada saat render server, sehingga baris URL-nya hilang di HTML
 * SSR lalu muncul saat hidrasi — Vue melaporkannya sebagai hydration mismatch
 * dan membuang DOM tiket yang sudah dirender. Disusun dari konfigurasi, server
 * dan peramban menghasilkan teks yang sama persis.
 */
const appUrl = useRuntimeConfig().public.appUrl
const trackUrl = computed(() => `${appUrl}/queue/${token}`)

const ticket = computed<TicketPayload | null>(() => {
  if (!data.value) return null
  return {
    organizationName: data.value.event.name,
    queueNumber: data.value.queueNumber,
    queueTypeName: data.value.queueType.name,
    counterName: data.value.counter?.name ?? null,
    serviceDate: data.value.serviceDate,
    issuedAt: new Date(data.value.createdAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
    nowServing: data.value.nowServing?.queueNumber ?? null,
    visitorName: data.value.visitorName,
    trackUrl: trackUrl.value,
  }
})

function printTicket() {
  if (import.meta.client) window.print()
}

// ---- rating & testimoni (§23) ----
const { call } = useApi()
const rating = ref(0)
const comment = ref('')
const submitted = ref(false)

/** Penilaian hanya masuk akal setelah benar-benar dilayani, dan hanya sekali. */
const canRate = computed(() =>
  !!data.value?.ratingEnabled && data.value?.status === 'COMPLETED' && !data.value?.testimonial && !submitted.value)

const savedTestimonial = computed(() => data.value?.testimonial ?? null)

async function submitRating() {
  if (!rating.value) return
  const res = await call(
    `/api/public/track/${token}/testimonial`,
    { method: 'POST', body: { rating: rating.value, comment: comment.value.trim() || null } },
    'Terima kasih atas penilaian Anda',
  )
  if (res) {
    submitted.value = true
    await refresh()
  }
}
</script>

<template>
  <div class="min-h-screen bg-slate-50 pb-10 dark:bg-slate-950">
    <div v-if="error" class="mx-auto max-w-md px-4 py-20 text-center">
      <UIcon name="i-lucide-search-x" class="mx-auto size-12 text-slate-400" />
      <h1 class="mt-4 text-xl font-bold">
        Antrean tidak ditemukan
      </h1>
      <p class="mt-2 text-slate-500">
        Tautan mungkin salah atau sudah kedaluwarsa.
      </p>
    </div>

    <template v-else-if="data">
      <!-- Banner dipanggil -->
      <div
        v-if="isCalled"
        class="px-5 py-10 text-center text-white transition-colors"
        :class="justCalled ? 'animate-pulse' : ''"
        :style="{ backgroundColor: primary }"
      >
        <p class="text-5xl">
          🔔
        </p>
        <p class="mt-3 text-sm font-semibold uppercase tracking-[0.3em] text-white/80">
          Nomor Anda dipanggil
        </p>
        <p class="queue-number mt-1 text-7xl">
          {{ data.queueNumber }}
        </p>
        <p class="mt-3 text-lg">
          Silakan menuju
        </p>
        <p class="text-2xl font-bold">
          {{ data.counter?.name ?? data.queueType.name }}
        </p>
        <p v-if="data.recallCount" class="mt-2 text-sm text-white/70">
          Dipanggil ulang {{ data.recallCount }}×
        </p>
      </div>

      <!-- Tiket normal -->
      <div v-else class="px-5 pb-14 pt-10 text-center text-white" :style="{ backgroundColor: primary }">
        <p class="text-sm font-semibold uppercase tracking-[0.3em] text-white/70">
          Antrean Anda
        </p>
        <p class="queue-number mt-2 text-7xl">
          {{ data.queueNumber }}
        </p>
        <p class="mt-2 text-lg">
          {{ data.queueType.name }}
        </p>
      </div>

      <main class="mx-auto -mt-8 max-w-md px-4">
        <div class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div class="flex items-center justify-between">
            <span class="text-sm text-slate-500">Status</span>
            <span
              class="rounded-full px-3 py-1 text-sm font-semibold"
              :class="{
                'status-waiting': data.status === 'WAITING',
                'status-called': data.status === 'CALLED',
                'status-serving': data.status === 'SERVING',
                'status-completed': data.status === 'COMPLETED',
                'status-skipped': data.status === 'SKIPPED',
                'status-cancelled': ['CANCELLED', 'NO_SHOW'].includes(data.status),
              }"
            >
              {{ QUEUE_STATUS_LABEL[data.status] ?? data.status }}
            </span>
          </div>

          <div v-if="data.status === 'WAITING'" class="mt-5 grid grid-cols-2 gap-4 border-t border-slate-100 pt-5 text-center dark:border-slate-800">
            <div>
              <p class="text-3xl font-bold tabular-nums">
                {{ data.position.ahead }}
              </p>
              <p class="text-xs text-slate-500">
                orang di depan Anda
              </p>
            </div>
            <div>
              <p class="text-3xl font-bold">
                {{ estimateText(data.position.estimateSeconds) }}
              </p>
              <p class="text-xs text-slate-500">
                perkiraan menunggu
              </p>
            </div>
          </div>

          <div v-if="data.nowServing" class="mt-5 rounded-xl bg-slate-50 p-4 text-center dark:bg-slate-800/50">
            <p class="text-xs uppercase tracking-wide text-slate-500">
              Sedang dilayani
            </p>
            <p class="queue-number text-3xl" :style="{ color: primary }">
              {{ data.nowServing.queueNumber }}
            </p>
            <p v-if="data.nowServing.counterName" class="text-sm text-slate-500">
              di {{ data.nowServing.counterName }}
            </p>
          </div>

          <dl class="mt-5 space-y-2 border-t border-slate-100 pt-5 text-sm dark:border-slate-800">
            <div v-if="data.visitorName" class="flex justify-between">
              <dt class="text-slate-500">
                Nama
              </dt>
              <dd class="font-medium">
                {{ data.visitorName }}
              </dd>
            </div>
            <div class="flex justify-between">
              <dt class="text-slate-500">
                Tanggal layanan
              </dt>
              <dd class="font-medium">
                {{ data.serviceDate }}
              </dd>
            </div>
            <div class="flex justify-between">
              <dt class="text-slate-500">
                Waktu ambil
              </dt>
              <dd class="font-medium">
                {{ new Date(data.createdAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) }}
              </dd>
            </div>
            <div v-if="data.counter" class="flex justify-between">
              <dt class="text-slate-500">
                Loket
              </dt>
              <dd class="font-medium">
                {{ data.counter.name }}
              </dd>
            </div>
          </dl>

          <div class="mt-5 flex items-center justify-between border-t border-slate-100 pt-4 dark:border-slate-800">
            <span class="flex items-center gap-1.5 text-xs" :class="connected ? 'text-emerald-600' : 'text-slate-400'">
              <span class="size-1.5 rounded-full" :class="connected ? 'bg-emerald-500' : 'bg-slate-400'" />
              {{ connected ? 'Pembaruan otomatis' : 'Mode offline' }}
            </span>
            <div class="flex items-center gap-1">
              <UButton
                size="xs"
                variant="ghost"
                color="neutral"
                icon="i-lucide-printer"
                label="Cetak"
                @click="printTicket"
              />
              <UButton
                size="xs"
                variant="ghost"
                color="neutral"
                icon="i-lucide-refresh-cw"
                label="Perbarui"
                :loading="refreshing"
                @click="manualRefresh"
              />
            </div>
          </div>
        </div>

        <UAlert
          v-if="data.status === 'SKIPPED'"
          class="mt-4"
          color="warning"
          variant="soft"
          icon="i-lucide-alert-triangle"
          title="Nomor Anda terlewat"
          description="Silakan hubungi petugas agar nomor Anda dipanggil kembali."
        />

        <UAlert
          v-if="isFinished"
          class="mt-4"
          color="success"
          variant="soft"
          icon="i-lucide-check-circle"
          title="Layanan selesai"
          description="Terima kasih atas kunjungan Anda."
        />

        <!-- Penilaian pengunjung (§23) -->
        <div
          v-if="canRate"
          class="mt-4 rounded-2xl border border-slate-200 bg-white p-5 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900"
        >
          <p class="font-semibold">
            Bagaimana pengalaman Anda?
          </p>
          <p class="mt-1 text-sm text-slate-500">
            Penilaian Anda membantu kami memperbaiki layanan.
          </p>

          <PublicRatingStars v-model="rating" class="mt-4" size="lg" />

          <UTextarea
            v-model="comment"
            class="mt-4 w-full"
            :rows="3"
            :maxlength="1000"
            placeholder="Komentar (opsional)"
          />

          <UiActionButton
            class="mt-3 w-full justify-center"
            icon="i-lucide-send"
            label="Kirim Penilaian"
            :disabled="!rating"
            :action="submitRating"
          />
        </div>

        <div
          v-else-if="savedTestimonial"
          class="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-center dark:border-emerald-900 dark:bg-emerald-950/40"
        >
          <p class="text-sm font-medium text-emerald-800 dark:text-emerald-200">
            Penilaian Anda sudah kami terima
          </p>
          <PublicRatingStars class="mt-2" :model-value="savedTestimonial.rating" readonly size="sm" />
          <p v-if="savedTestimonial.comment" class="mt-2 text-sm italic text-emerald-700 dark:text-emerald-300">
            "{{ savedTestimonial.comment }}"
          </p>
        </div>

        <p class="mt-6 text-center text-xs text-slate-400">
          Simpan halaman ini untuk memantau antrean Anda.
        </p>

        <!-- Hanya muncul saat dicetak -->
        <PublicPrintTicket v-if="ticket" :ticket="ticket" />
      </main>
    </template>
  </div>
</template>
