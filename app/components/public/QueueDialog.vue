<script setup lang="ts">
import type { PublicFormFieldDef, PublicServiceView, PublicTicketView } from '#shared/types/public-page'
import type { PublicPageTheme } from '#shared/schemas/public-page'
import { withAlpha } from '#shared/utils/color'
import { buildFormValidator, type FormFieldDef } from '#shared/utils/dynamic-form'

/**
 * Jendela pengambilan nomor antrean.
 *
 * Sebelumnya formulir ini menggantikan seluruh isi halaman, sehingga pengunjung
 * kehilangan konteks layanan yang baru saja ia pilih dan harus menekan "kembali"
 * untuk membandingkan. Sebagai jendela, daftar layanan tetap terlihat di belakangnya.
 *
 * Komponen ini hanya menampilkan: seluruh validasi, pemanggilan API, dan aturan
 * antrean tetap di halaman induk. Yang dikirim ke sini hanyalah keadaan yang perlu
 * digambar.
 */
const props = defineProps<{
  service: PublicServiceView | null
  /** Nomor yang sudah dipegang pengunjung pada layanan ini. */
  ticket?: PublicTicketView | null
  fields: PublicFormFieldDef[]
  formDescription?: string | null
  values: Record<string, unknown>
  fieldErrors: Record<string, string[]>
  submitting: boolean
  submitError: string
  /** Pendaftaran masih dibuka? Tombol kirim mengikuti ini. */
  acceptsNew: boolean
  registrationEnabled: boolean
  /* anti-bot */
  turnstileSiteKey: string
  turnstileRequired: boolean
  sliderRequired: boolean
  /* isi otomatis (§6) */
  autofillKey: string | null
  autofilling: boolean
  autofillMessage: string
  autofillStatus: 'idle' | 'ok' | 'error'
  autofilledKeys: string[]
  /**
   * Tema halaman, untuk warna tombol dan aksen di dalam dialog.
   *
   * Harus dikirim sebagai prop: dialog ini `UModal` yang di-teleport ke `body`
   * dan dipasang sebagai saudara — bukan anak — dari perender halaman, jadi
   * variabel CSS tema yang dideklarasikan di akar perender tidak pernah
   * mewaris sampai ke sini.
   */
  theme: PublicPageTheme
}>()

const themeVars = usePublicThemeVars(() => props.theme)

const emit = defineEmits<{
  submit: []
  autofill: []
  /** Pengunjung yang sudah punya nomor menyatakan ingin mendaftar lagi. */
  again: []
}>()

const open = defineModel<boolean>('open', { default: false })
const captchaToken = defineModel<string>('captchaToken', { default: '' })

const isMobile = useIsMobile()
const { readable } = useReadableColor()

const turnstileRef = ref<{ reset: () => void } | null>(null)
const sliderRef = ref<{ minta: () => Promise<string | null> } | null>(null)

/** Field HIDDEN tetap terkirim memakai nilai bawaannya, tetapi tidak digambar. */
const visibleFields = computed(() => props.fields.filter(f => f.type !== 'HIDDEN'))

/* ------------------------------------------------------------------
   Pemeriksaan isian di sisi pengunjung

   Aturannya TIDAK ditulis ulang di sini: `buildFormValidator` adalah pembangun
   yang sama dengan yang dipakai server saat menerima kiriman. Aturan yang
   digandakan akan menyimpang, dan bentuk penyimpangannya selalu merugikan
   pengunjung — klien meloloskan sesuatu yang lalu ditolak server, tepat setelah
   ia menyelesaikan teka-teki geser.

   Yang diperiksa hanya kolom yang TERLIHAT: kolom tersembunyi diisi sistem, dan
   memasukkannya ke pemeriksaan berarti menolak kiriman karena sesuatu yang tidak
   pernah muncul di depan pengunjung.
------------------------------------------------------------------ */
const validator = computed(() => buildFormValidator(visibleFields.value as unknown as FormFieldDef[]))

/**
 * Kolom yang sudah disentuh pengunjung.
 *
 * Penanda merah hanya muncul setelah ia meninggalkan kolomnya — formulir yang
 * langsung memerah sebelum satu huruf pun diketik terasa seperti menuduh.
 */
const disentuh = ref<Set<string>>(new Set())

/** Setelah tombol ditekan, SELURUH galat ditampilkan, bukan hanya yang disentuh. */
const kirimDicoba = ref(false)

/** Galat per kolom, dikelompokkan dari hasil pemeriksaan zod. */
const galatLokal = computed<Record<string, string[]>>(() => {
  const hasil = validator.value.safeParse(props.values)
  if (hasil.success) return {}

  const peta: Record<string, string[]> = {}
  for (const issue of hasil.error.issues) {
    const kunci = String(issue.path[0] ?? '')
    if (!kunci) continue
    peta[kunci] = [...(peta[kunci] ?? []), issue.message]
  }
  return peta
})

function tandaiDisentuh(kunci: string) {
  if (disentuh.value.has(kunci)) return
  disentuh.value = new Set(disentuh.value).add(kunci)
}

/**
 * Pesan yang ditampilkan di bawah kolom.
 *
 * Galat lokal didahulukan karena ia yang paling baru; galat dari server tetap
 * ditampilkan untuk hal-hal yang hanya server tahu — kuota harian, jam layanan,
 * nilai yang bentrok dengan data lain.
 */
function pesanGalat(kunci: string): string | undefined {
  const bolehTampil = kirimDicoba.value || disentuh.value.has(kunci)
  if (bolehTampil && galatLokal.value[kunci]?.length) return galatLokal.value[kunci]![0]
  return props.fieldErrors[kunci]?.[0]
}

/** Kolom sudah terisi DAN lolos aturannya — dasar tanda centang hijau. */
function sudahSah(kunci: string): boolean {
  const nilai = props.values[kunci]
  const terisi = Array.isArray(nilai)
    ? nilai.length > 0
    : typeof nilai === 'string' ? nilai.trim() !== '' : nilai !== undefined && nilai !== null
  return terisi && !galatLokal.value[kunci]?.length
}

/** Pengunjung yang sudah punya nomor melihat nomornya dulu, bukan formulir kosong. */
const mode = ref<'ticket' | 'form'>('form')
watch(() => [open.value, props.ticket] as const, ([terbuka]) => {
  if (!terbuka) return
  mode.value = props.ticket ? 'ticket' : 'form'
  /*
   * Penanda dilupakan setiap kali jendela dibuka. Layanan berikutnya punya
   * formulir sendiri, dan galat yang tertinggal dari layanan sebelumnya akan
   * menuduh kolom yang bahkan belum pernah dilihat.
   */
  disentuh.value = new Set()
  kirimDicoba.value = false
}, { immediate: true })

function daftarLagi() {
  mode.value = 'form'
  emit('again')
}

const estimasi = computed(() => {
  if (!props.service) return ''
  if (!props.service.waitingCount) return 'Tanpa antrean'
  return `± ${Math.round((props.service.estServiceSeconds * props.service.waitingCount) / 60)} menit`
})

function optionsOf(field: PublicFormFieldDef): Array<{ label: string, value: string }> {
  const raw = field.options
  if (!Array.isArray(raw)) return []
  return raw.map(o => (typeof o === 'string' ? { label: o, value: o } : (o as { label: string, value: string })))
}

function inputType(type: string) {
  return type === 'NUMBER'
    ? 'number'
    : type === 'DATE'
      ? 'date'
      : type === 'DATETIME'
        ? 'datetime-local'
        : type === 'EMAIL' ? 'email' : type === 'PHONE' ? 'tel' : 'text'
}

function labelStatus(status: string) {
  if (status === 'CALLED') return 'Sedang dipanggil'
  if (status === 'SERVING') return 'Sedang dilayani'
  return 'Menunggu dipanggil'
}

const bisaKirim = computed(() =>
  props.acceptsNew && !(props.turnstileRequired && !captchaToken.value))

/**
 * Periksa seluruh isian; dipanggil induk SEBELUM meminta verifikasi keamanan.
 *
 * Mengembalikan `false` bila ada yang belum benar, sekaligus menampilkan
 * seluruh galatnya dan memindahkan fokus ke kolom bermasalah yang pertama —
 * pada formulir panjang, pesan galat di luar layar sama saja dengan tidak ada.
 */
function validasiIsian(): boolean {
  kirimDicoba.value = true

  const bermasalah = visibleFields.value.map(f => f.key).filter(k => galatLokal.value[k]?.length)
  if (!bermasalah.length) return true

  void nextTick(() => {
    const el = document.querySelector<HTMLElement>(
      `[data-field="${bermasalah[0]}"] input, [data-field="${bermasalah[0]}"] textarea, [data-field="${bermasalah[0]}"] button`,
    )
    el?.focus()
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  })
  return false
}

defineExpose({
  /** Dipanggil induk sebelum mengirim; mengembalikan tiket captcha geser. */
  mintaSlider: () => sliderRef.value?.minta() ?? Promise.resolve(null),
  resetTurnstile: () => turnstileRef.value?.reset(),
  validasiIsian,
})
</script>

<template>
  <UModal
    v-model:open="open"
    :fullscreen="isMobile"
    :title="service?.name ?? 'Ambil nomor antrean'"
    :description="mode === 'ticket' ? 'Nomor antrean Anda pada layanan ini.' : 'Lengkapi data berikut untuk mendapatkan nomor.'"
    :ui="{ content: 'sm:max-w-lg' }"
  >
    <template #body>
      <!--
        Variabel tema dipasang di sini, bukan diwarisi dari halaman.

        Isi modal di-teleport ke `body`, di luar elemen yang mendeklarasikan
        `--public-*`. Tanpa baris ini `var(--public-primary)` tidak resolve dan
        tombol "Ambil Nomor Antrean" tampil tanpa warna sama sekali.
      -->
      <div v-if="service" class="space-y-5" :style="themeVars">
        <!-- Ringkasan layanan: kode, jumlah menunggu, estimasi -->
        <div
          class="flex items-center gap-4 rounded-2xl p-4"
          :style="{ backgroundColor: withAlpha(service.color, 0.1) }"
        >
          <div
            class="flex size-12 shrink-0 items-center justify-center rounded-xl text-lg font-extrabold"
            :style="{ backgroundColor: withAlpha(service.color, 0.18), color: readable(service.color) }"
            aria-hidden="true"
          >
            {{ service.code }}
          </div>
          <dl class="grid min-w-0 flex-1 grid-cols-2 gap-3">
            <div class="min-w-0">
              <dt class="text-xs text-slate-500">
                Sedang menunggu
              </dt>
              <dd class="truncate font-bold tabular-nums">
                {{ service.waitingCount }} orang
              </dd>
            </div>
            <div class="min-w-0">
              <dt class="text-xs text-slate-500">
                Estimasi tunggu
              </dt>
              <dd class="truncate font-bold">
                {{ estimasi }}
              </dd>
            </div>
          </dl>
        </div>

        <!-- Sudah punya nomor -->
        <template v-if="mode === 'ticket' && ticket">
          <div class="rounded-2xl border border-slate-200 p-6 text-center dark:border-slate-800">
            <p class="text-sm text-slate-500">
              Nomor antrean Anda
            </p>
            <p class="queue-number mt-1 text-6xl" :style="{ color: readable(service.color) }">
              {{ ticket.queueNumber }}
            </p>
            <p class="mt-2 text-sm font-medium">
              {{ labelStatus(ticket.status) }}
            </p>

            <div class="mt-5 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4 dark:border-slate-800">
              <div>
                <p class="text-xs uppercase tracking-wide text-slate-500">
                  Antrean di depan
                </p>
                <p class="mt-0.5 text-xl font-bold tabular-nums">
                  {{ ticket.ahead }}
                </p>
              </div>
              <div>
                <p class="text-xs uppercase tracking-wide text-slate-500">
                  Sedang dipanggil
                </p>
                <p class="mt-0.5 text-xl font-bold">
                  {{ ticket.nowServing ?? '—' }}
                </p>
              </div>
            </div>
          </div>

          <UButton
            class="w-full justify-center"
            size="lg"
            icon="i-lucide-ticket"
            label="Lihat Antrean Saya"
            :to="`/queue/${ticket.token}`"
            :style="{ backgroundColor: 'var(--public-primary)', color: 'var(--public-on-primary)' }"
          />

          <!--
            Mendaftar lagi sengaja menjadi pilihan kedua: kebanyakan pengunjung yang
            membuka layanan ini lagi hanya ingin melihat nomornya.
          -->
          <div v-if="registrationEnabled && acceptsNew" class="text-center">
            <UButton
              variant="ghost"
              color="neutral"
              icon="i-lucide-plus"
              label="Registrasi Kembali"
              @click="daftarLagi"
            />
            <p class="mt-1 text-xs text-slate-500">
              Nomor lama tetap berlaku bila Anda mengambil nomor baru.
            </p>
          </div>
        </template>

        <!-- Formulir pengunjung -->
        <form v-else class="space-y-4" @submit.prevent="emit('submit')">
          <p v-if="formDescription" class="text-sm text-slate-500">
            {{ formDescription }}
          </p>

          <UFormField
            v-for="field in visibleFields"
            :key="field.id"
            :data-field="field.key"
            :label="field.label"
            :required="field.isRequired"
            :help="field.helpText ?? undefined"
            :error="pesanGalat(field.key)"
          >
            <!--
              Tanda centang di baris label, bukan di dalam kolomnya.

              Satu tempat untuk SEMUA tipe isian — teks, area teks, dropdown,
              pilihan tunggal, pilihan ganda. Menaruhnya di dalam kolom berarti
              lima penanganan berbeda, dan tiga di antaranya tidak punya tempat
              untuk ikon sama sekali.
            -->
            <template #hint>
              <span
                v-if="sudahSah(field.key)"
                class="flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400"
              >
                <UIcon name="i-lucide-check" class="size-3.5" />
                
              </span>
            </template>
            <UTextarea
              v-if="field.type === 'TEXTAREA'"
              v-model="values[field.key] as string"
              :placeholder="field.placeholder ?? ''"
              :rows="3"
              size="lg"
              class="w-full"
              @blur="tandaiDisentuh(field.key)"
            />
            <!--
              Pilihan ditandai disentuh saat NILAINYA berubah, bukan saat kolomnya
              ditinggalkan: dropdown dan pilihan tidak punya momen "selesai
              mengetik", dan menunggu blur membuat penandanya tertinggal satu
              langkah di belakang.
            -->
            <USelect
              v-else-if="field.type === 'SELECT'"
              v-model="values[field.key] as string"
              :items="optionsOf(field)"
              :placeholder="field.placeholder ?? 'Pilih…'"
              size="lg"
              class="w-full"
              @update:model-value="tandaiDisentuh(field.key)"
            />
            <URadioGroup
              v-else-if="field.type === 'RADIO'"
              v-model="values[field.key] as string"
              :items="optionsOf(field)"
              @update:model-value="tandaiDisentuh(field.key)"
            />
            <UCheckboxGroup
              v-else-if="field.type === 'CHECKBOX'"
              v-model="values[field.key] as string[]"
              :items="optionsOf(field)"
              @update:model-value="tandaiDisentuh(field.key)"
            />
            <!-- Unggah berkas belum tersedia; jangan pura-pura bisa. -->
            <div
              v-else-if="field.type === 'FILE'"
              class="flex items-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 py-3 text-sm text-slate-400 dark:border-slate-700"
            >
              <UIcon name="i-lucide-paperclip" class="size-4" />
              Unggah berkas belum tersedia
            </div>
            <div v-else class="flex gap-2">
              <UInput
                v-model="values[field.key] as string"
                :type="inputType(field.type)"
                :placeholder="field.placeholder ?? ''"
                size="lg"
                class="w-full"
                :class="autofilledKeys.includes(field.key) ? 'rounded-lg ring-1 ring-emerald-400' : ''"
                @blur="tandaiDisentuh(field.key)"
                @keydown.enter.prevent="field.key === autofillKey ? emit('autofill') : undefined"
              />
              <!-- Tombol cari hanya pada field pemicu yang ditentukan admin (§6) -->
              <UButton
                v-if="field.key === autofillKey"
                size="lg"
                variant="outline"
                color="neutral"
                icon="i-lucide-search"
                label="Cari Data"
                :loading="autofilling"
                @click="emit('autofill')"
              />
            </div>
          </UFormField>

          <UAlert
            v-if="autofillMessage"
            :color="autofillStatus === 'ok' ? 'success' : 'warning'"
            variant="soft"
            :icon="autofillStatus === 'ok' ? 'i-lucide-wand-sparkles' : 'i-lucide-info'"
            :description="autofillMessage"
          />

          <PublicTurnstileWidget
            v-if="turnstileRequired"
            ref="turnstileRef"
            v-model="captchaToken"
            :site-key="turnstileSiteKey"
          />

          <UAlert
            v-if="submitError"
            color="error"
            variant="soft"
            icon="i-lucide-alert-circle"
            :description="submitError"
          />

          <button
            type="submit"
            class="inline-flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3.5 text-base font-semibold transition-transform hover:scale-[1.01] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
            :style="{ backgroundColor: 'var(--public-primary)', color: 'var(--public-on-primary)', outlineColor: 'var(--public-primary)' }"
            :disabled="submitting || !bisaKirim"
          >
            <UIcon :name="submitting ? 'i-lucide-loader-circle' : 'i-lucide-ticket'" class="size-5" :class="{ 'animate-spin': submitting }" />
            Ambil Nomor Antrean
          </button>

          <UiSliderCaptcha v-if="sliderRequired" ref="sliderRef" purpose="queue" />
        </form>
      </div>
    </template>
  </UModal>
</template>
