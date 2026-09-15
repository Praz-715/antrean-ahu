<script setup lang="ts">
import { apiFetch, ApiError } from '~/composables/useApi'

/**
 * Captcha geser: pengguna menyeret potongan teka-teki sampai pas dengan lubangnya.
 *
 * Dipakai sebagai gerbang sebelum aksi, bukan sebagai isian di dalam formulir —
 * jendela ini muncul saat tombol ditekan, lalu aksinya diteruskan setelah
 * verifikasinya lolos. Pemakaiannya:
 *
 *   const captcha = ref<{ minta: () => Promise<string | null> } | null>(null)
 *   const tiket = await captcha.value?.minta()
 *   if (!tiket) return            // pengguna menutup jendela
 *
 * Gambar teka-teki dibuat di server dan posisi lubangnya tidak pernah dikirim ke
 * sini; komponen ini hanya melaporkan di mana potongan dilepas.
 */
const props = defineProps<{
  /** Tiket yang terbit terikat pada keperluan ini dan tidak bisa dipakai di tempat lain. */
  purpose: 'login' | 'queue'
}>()

interface Challenge {
  id: string
  background: string
  piece: string
  pieceY: number
  width: number
  height: number
  pieceSize: number
}

const open = ref(false)
const challenge = ref<Challenge | null>(null)
const memuat = ref(false)
const status = ref<'diam' | 'memeriksa' | 'berhasil' | 'gagal'>('diam')
const pesan = ref('')

/** Posisi kiri potongan, dalam piksel kanvas. */
const posisi = ref(0)
const menyeret = ref(false)

const maksGeser = computed(() => (challenge.value ? challenge.value.width - challenge.value.pieceSize : 0))

/** Pemanggil yang sedang menunggu hasil verifikasi. */
const penunggu: Array<(tiket: string | null) => void> = []

let mulaiPointer = 0
let mulaiPosisi = 0
let mulaiWaktu = 0
let gerakan = 0

async function muatTekaTeki() {
  memuat.value = true
  status.value = 'diam'
  pesan.value = ''
  posisi.value = 0
  gerakan = 0

  try {
    challenge.value = await apiFetch<Challenge>(`/api/captcha/slider?purpose=${props.purpose}`)
  }
  catch (error) {
    challenge.value = null
    status.value = 'gagal'
    pesan.value = error instanceof ApiError ? error.message : 'Gagal memuat verifikasi'
  }
  finally {
    memuat.value = false
  }
}

function lepaskanPenunggu(tiket: string | null) {
  while (penunggu.length) penunggu.shift()?.(tiket)
}

/** Membuka jendela verifikasi; janji ini selesai saat lolos, atau null bila ditutup. */
async function minta(): Promise<string | null> {
  // Jendela yang sudah terbuka tidak dimuat ulang — penekanan tombol kedua ikut
  // menunggu hasil teka-teki yang sedang dikerjakan.
  if (!open.value) {
    open.value = true
    await muatTekaTeki()
  }
  return new Promise(resolve => penunggu.push(resolve))
}

function tutup(tiket: string | null) {
  // Pemanggil dilepas lebih dulu: menutup jendela memicu pengawas di bawah, yang
  // akan melepas siapa pun yang masih menunggu dengan nilai null.
  lepaskanPenunggu(tiket)
  open.value = false
}

/* ------------------------------------------------------------------ *
 * Menyeret
 * ------------------------------------------------------------------ */

function mulaiSeret(event: PointerEvent) {
  if (status.value === 'memeriksa' || status.value === 'berhasil' || !challenge.value) return

  menyeret.value = true
  mulaiPointer = event.clientX
  mulaiPosisi = posisi.value
  mulaiWaktu = performance.now()
  gerakan = 0
  pesan.value = ''
  status.value = 'diam'
  ;(event.target as HTMLElement).setPointerCapture?.(event.pointerId)
}

function seret(event: PointerEvent) {
  if (!menyeret.value) return
  gerakan += 1
  posisi.value = Math.min(maksGeser.value, Math.max(0, mulaiPosisi + (event.clientX - mulaiPointer)))
}

function lepas() {
  if (!menyeret.value) return
  menyeret.value = false
  void periksa()
}

/**
 * Papan ketik ikut didukung penuh.
 *
 * Halaman masuk berada di belakang verifikasi ini; kalau hanya bisa diseret dengan
 * tetikus, pengguna yang bergantung pada papan ketik terkunci di luar aplikasi.
 */
function tombolArah(event: KeyboardEvent) {
  if (!challenge.value || status.value === 'memeriksa' || status.value === 'berhasil') return

  const langkah = event.shiftKey ? 10 : 2
  let geser = 0

  if (event.key === 'ArrowRight') geser = langkah
  else if (event.key === 'ArrowLeft') geser = -langkah
  else if (event.key === 'Home') geser = -maksGeser.value
  else if (event.key === 'End') geser = maksGeser.value
  else if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    void periksa()
    return
  }
  else return

  event.preventDefault()
  if (!gerakan) mulaiWaktu = performance.now()
  gerakan += 1
  posisi.value = Math.min(maksGeser.value, Math.max(0, posisi.value + geser))
}

/* ------------------------------------------------------------------ *
 * Memeriksa
 * ------------------------------------------------------------------ */

async function periksa() {
  if (!challenge.value || status.value === 'memeriksa') return

  status.value = 'memeriksa'
  try {
    const { token } = await apiFetch<{ token: string }>('/api/captcha/slider', {
      method: 'POST',
      body: {
        id: challenge.value.id,
        x: Math.round(posisi.value),
        durationMs: Math.round(performance.now() - mulaiWaktu),
        moves: gerakan,
        purpose: props.purpose,
      },
    })

    status.value = 'berhasil'
    pesan.value = 'Terverifikasi'
    // Jeda sebentar supaya tanda berhasilnya sempat terlihat sebelum jendela tertutup.
    setTimeout(() => tutup(token), 550)
  }
  catch (error) {
    status.value = 'gagal'
    pesan.value = error instanceof ApiError ? error.message : 'Verifikasi gagal, coba lagi'
    // Teka-teki baru: jawaban yang sudah dikirim tidak boleh dicoba ulang berkali-kali.
    setTimeout(() => { if (open.value) void muatTekaTeki() }, 900)
  }
}

watch(open, (terbuka) => {
  // Menutup lewat tombol Esc atau klik latar tetap harus melepaskan pemanggilnya.
  if (!terbuka) lepaskanPenunggu(null)
})

defineExpose({ minta })
</script>

<template>
  <UModal
    v-model:open="open"
    title="Verifikasi keamanan"
    description="Geser potongan sampai pas dengan lubang pada gambar."
    :ui="{ content: 'max-w-sm' }"
  >
    <template #body>
      <div class="space-y-3">
        <div
          class="relative mx-auto overflow-hidden rounded-lg border border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-800"
          :style="{ width: `${challenge?.width ?? 280}px`, height: `${challenge?.height ?? 170}px` }"
        >
          <template v-if="challenge">
            <img :src="challenge.background" alt="" class="block size-full select-none" draggable="false">
            <img
              :src="challenge.piece"
              alt=""
              class="absolute select-none drop-shadow-md"
              draggable="false"
              :class="menyeret ? '' : 'transition-[left] duration-150'"
              :style="{ left: `${posisi}px`, top: `${challenge.pieceY}px`, width: `${challenge.pieceSize}px` }"
            >
          </template>

          <div v-else class="flex size-full items-center justify-center text-sm text-slate-500">
            <template v-if="memuat">
              Memuat teka-teki…
            </template>
            <template v-else>
              {{ pesan || 'Teka-teki tidak dapat dimuat' }}
            </template>
          </div>

          <!-- Pita hasil, menutupi gambar hanya saat ada yang perlu diberitahukan -->
          <div
            v-if="status === 'berhasil' || status === 'gagal'"
            class="absolute inset-x-0 bottom-0 px-2 py-1 text-center text-xs font-medium text-white"
            :class="status === 'berhasil' ? 'bg-emerald-600/90' : 'bg-rose-600/90'"
          >
            {{ pesan }}
          </div>
        </div>

        <!-- Rel geser -->
        <div
          class="relative mx-auto h-10 rounded-lg border border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-800"
          :style="{ width: `${challenge?.width ?? 280}px` }"
        >
          <span class="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-slate-500">
            {{ status === 'berhasil' ? 'Terverifikasi' : 'Geser ke kanan' }}
          </span>

          <button
            type="button"
            role="slider"
            :aria-valuemin="0"
            :aria-valuemax="maksGeser"
            :aria-valuenow="Math.round(posisi)"
            aria-label="Geser potongan sampai pas dengan lubang, lalu tekan Enter"
            :disabled="!challenge || status === 'memeriksa' || status === 'berhasil'"
            class="absolute top-0 flex h-10 touch-none items-center justify-center rounded-lg border shadow-sm transition-colors disabled:cursor-not-allowed"
            :class="status === 'berhasil'
              ? 'border-emerald-500 bg-emerald-500 text-white'
              : status === 'gagal'
                ? 'border-rose-500 bg-rose-500 text-white'
                : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200'"
            :style="{ left: `${posisi}px`, width: `${challenge?.pieceSize ?? 52}px` }"
            @pointerdown="mulaiSeret"
            @pointermove="seret"
            @pointerup="lepas"
            @pointercancel="lepas"
            @keydown="tombolArah"
          >
            <UIcon
              :name="status === 'memeriksa'
                ? 'i-lucide-loader-circle'
                : status === 'berhasil' ? 'i-lucide-check' : 'i-lucide-chevrons-right'"
              class="size-5"
              :class="{ 'animate-spin': status === 'memeriksa' }"
            />
          </button>
        </div>
      </div>
    </template>

    <template #footer>
      <div class="flex w-full items-center justify-between">
        <UButton
          icon="i-lucide-rotate-cw"
          variant="ghost"
          color="neutral"
          size="sm"
          label="Ganti gambar"
          :loading="memuat"
          @click="muatTekaTeki()"
        />
        <UButton variant="ghost" color="neutral" size="sm" label="Batal" @click="tutup(null)" />
      </div>
    </template>
  </UModal>
</template>
