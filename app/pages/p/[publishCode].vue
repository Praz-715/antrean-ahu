<script setup lang="ts">
import { apiFetch } from '../../composables/useApi'
import type { ApiError } from '../../composables/useApi'
import type { PublicFormFieldDef, PublicPageView, PublicTicketView } from '#shared/types/public-page'

definePageMeta({ layout: 'public' })

const route = useRoute()
const publishCode = route.params.publishCode as string

/**
 * Halaman pengunjung.
 *
 * Seluruh tampilannya digambar `PublicPageRenderer` — komponen yang sama dengan yang
 * dipakai pratinjau di builder. Berkas ini hanya mengurus yang tidak bisa diwakili
 * tampilan: memuat data, mengingat nomor yang sudah diambil, dan mengirim formulir.
 */
interface GeofenceState {
  required: boolean
  inside: boolean
  radiusM: number
  latitude: number | null
  longitude: number | null
  distanceM: number | null
}

/**
 * Halaman yang dipagari lokasi mengembalikan isi yang jauh lebih sedikit selama
 * pengunjung belum terbukti berada di dalam jangkauan — cukup untuk menggambar layar
 * verifikasi dengan identitas yang benar, tanpa membocorkan daftar layanan maupun
 * formulirnya.
 */
interface PublicPageResponse extends PublicPageView {
  access: 'granted' | 'geofenced'
  geofence: GeofenceState
  page: PublicPageView['page'] & { publishCode: string, requireCaptcha: boolean }
  event: PublicPageView['event'] & { id: string, status: string, timezone: string }
  form: {
    id: string
    name: string
    description: string | null
    requireCaptcha: boolean
    autofillFieldKey: string | null
    fields: PublicFormFieldDef[]
  } | null
  features: { publicRegistration: boolean, ratingEnabled: boolean }
}

/**
 * Koordinat pengunjung, bila halamannya memang meminta.
 *
 * Dikirim sebagai kueri dan diawasi `useAsyncData`, jadi begitu izin lokasi
 * diberikan halamannya diminta ulang sendiri — tanpa muat ulang penuh.
 */
const koordinat = ref<{ latitude: number, longitude: number } | null>(null)

const { data, error, refresh } = await useAsyncData(
  `public-page-${publishCode}`,
  () => apiFetch<PublicPageResponse>(`/api/public/${publishCode}`, {
    query: koordinat.value
      ? { lat: koordinat.value.latitude, lng: koordinat.value.longitude }
      : undefined,
  }),
  { watch: [koordinat] },
)

/* ---------------- pagar lokasi (§36) ---------------- */

const izinLokasi = ref<'idle' | 'meminta' | 'ditolak' | 'gagal' | 'tidakDidukung'>('idle')
const terpagari = computed(() => data.value?.access === 'geofenced')

/**
 * Meminta lokasi ke peramban.
 *
 * Ketelitian tinggi dinyalakan karena yang dibandingkan jarak ratusan meter, dan
 * hasil lama sampai satu menit masih boleh dipakai supaya menekan "coba lagi" tidak
 * selalu menyalakan GPS dari nol.
 */
function mintaLokasi() {
  if (!import.meta.client || !navigator.geolocation) {
    izinLokasi.value = 'tidakDidukung'
    return
  }

  izinLokasi.value = 'meminta'
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      izinLokasi.value = 'idle'
      koordinat.value = { latitude: pos.coords.latitude, longitude: pos.coords.longitude }
    },
    (err) => {
      izinLokasi.value = err.code === err.PERMISSION_DENIED ? 'ditolak' : 'gagal'
    },
    { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 },
  )
}

useHead(() => ({
  title: data.value?.page.title ?? 'Ambil Antrean',
  meta: [{ name: 'description', content: data.value?.page.subtitle ?? 'Ambil nomor antrean online' }],
}))

/**
 * Branding halaman didahulukan, lalu branding event.
 *
 * Satu event bisa punya beberapa halaman dengan tampilan berbeda; nilai yang tidak
 * diisi di halaman diturunkan dari event supaya admin tidak perlu menyalin setelan
 * yang sama berulang kali.
 */
const view = computed<PublicPageView | null>(() => {
  if (!data.value) return null

  const eventBranding = (data.value.event as unknown as { branding?: Record<string, unknown> }).branding ?? {}
  const warisan = eventBranding as { primaryColor?: string, secondaryColor?: string, fontFamily?: string, footerText?: string }
  const theme = data.value.page.theme

  return {
    ...data.value,
    page: {
      ...data.value.page,
      theme: {
        ...theme,
        primaryColor: theme.primaryColor || warisan.primaryColor || '#1b5cf5',
        secondaryColor: theme.secondaryColor || warisan.secondaryColor || '#0f172a',
        fontFamily: theme.fontFamily || warisan.fontFamily || '',
        footerText: theme.footerText || warisan.footerText || '',
      },
    },
  }
})

// ---- antrean yang sudah diambil dari perangkat ini ----
/**
 * Ingatan nomor dikunci pada kode publikasi yang dikembalikan server, bukan pada
 * potongan alamat yang dibuka — halaman ini bisa dicapai lewat kode maupun slug.
 */
const tickets = usePublicTickets(() => data.value?.page.publishCode ?? publishCode)
/** Kunci: id jenis antrean. Hanya berisi antrean yang MASIH berlaku hari ini. */
const myTickets = ref<Record<string, PublicTicketView>>({})

const STATUS_AKTIF = ['WAITING', 'CALLED', 'SERVING']

/**
 * Ingatan perangkat diperiksa ulang ke server, bukan dipercaya begitu saja.
 *
 * Tokennya bisa saja milik antrean kemarin, sudah selesai dilayani, atau dibatalkan
 * petugas. Menampilkannya sebagai "antrean Anda" pada keadaan itu justru menyesatkan,
 * jadi yang sudah tidak berlaku dilupakan diam-diam.
 *
 * Dijalankan setelah komponen terpasang: localStorage tidak ada saat render server,
 * dan menebaknya di sana hanya akan membuat hasil hidrasi berbeda.
 */
async function muatTiketSaya() {
  const tersimpan = tickets.read()
  const hasil: Record<string, PublicTicketView> = {}

  await Promise.all(Object.entries(tersimpan).map(async ([queueTypeId, token]) => {
    try {
      const tiket = await apiFetch<{
        queueNumber: string
        status: string
        serviceDate: string
        queueType: { id: string }
        position: { ahead: number }
        nowServing: { queueNumber: string } | null
      }>(`/api/public/track/${token}`)

      const masihBerlaku = STATUS_AKTIF.includes(tiket.status)
        && tiket.serviceDate === data.value?.openState.serviceDate

      if (!masihBerlaku) { tickets.forget(queueTypeId); return }

      hasil[tiket.queueType.id] = {
        token,
        queueNumber: tiket.queueNumber,
        status: tiket.status,
        ahead: tiket.position?.ahead ?? 0,
        nowServing: tiket.nowServing?.queueNumber ?? null,
      }
    }
    catch {
      // Token tidak dikenal lagi (antrean dihapus) — buang saja dari ingatan.
      tickets.forget(queueTypeId)
    }
  }))

  myTickets.value = hasil
}

onMounted(() => { void muatTiketSaya() })

// ---- pengambilan nomor ----
const dialogOpen = ref(false)
const dialogRef = ref<{ mintaSlider: () => Promise<string | null>, resetTurnstile: () => void } | null>(null)
const selectedTypeId = ref<string | null>(null)
const selectedType = computed(() => data.value?.queueTypes.find(t => t.id === selectedTypeId.value) ?? null)
const selectedTicket = computed(() =>
  selectedTypeId.value ? myTickets.value[selectedTypeId.value] ?? null : null)

const values = reactive<Record<string, unknown>>({})
const fieldErrors = ref<Record<string, string[]>>({})
const submitting = ref(false)
const submitError = ref('')

watchEffect(() => {
  for (const field of data.value?.form?.fields ?? []) {
    if (values[field.key] === undefined) {
      values[field.key] = field.type === 'CHECKBOX' ? [] : (field.defaultValue ?? '')
    }
  }
})

// ---- anti-bot (§36) ----
const turnstileSiteKey = useRuntimeConfig().public.turnstileSiteKey
const captchaToken = ref('')
const turnstileRequired = computed(() => !!data.value?.page.requireCaptcha && !!turnstileSiteKey)
/** Captcha geser; dinyalakan per formulir di /admin/forms, tanpa layanan luar. */
const sliderRequired = computed(() => !!data.value?.form?.requireCaptcha)

const visibleFields = computed(() => (data.value?.form?.fields ?? []).filter(f => f.type !== 'HIDDEN'))

/**
 * Layanan dipilih dari kartu.
 *
 * Bila belum ada isian sama sekali DAN pengunjung belum punya nomor di layanan itu,
 * jendela tidak perlu dibuka — satu ketukan sudah cukup untuk mengambil nomor.
 */
function pilihLayanan(id: string) {
  selectedTypeId.value = id
  submitError.value = ''
  fieldErrors.value = {}

  const perluJendela = !!myTickets.value[id] || visibleFields.value.length > 0
    || turnstileRequired.value || sliderRequired.value

  if (perluJendela) dialogOpen.value = true
  else void submit()
}

function daftarLagi() {
  submitError.value = ''
  fieldErrors.value = {}
}

// ---- isi otomatis dari sistem eksternal (§6) ----
const autofillKey = computed(() => data.value?.form?.autofillFieldKey ?? null)
const autofilling = ref(false)
const autofillMessage = ref('')
const autofillStatus = ref<'idle' | 'ok' | 'error'>('idle')
const autofilledKeys = ref<string[]>([])

async function runAutofill() {
  const key = autofillKey.value
  if (!key) return

  const lookup = String(values[key] ?? '').trim()
  if (!lookup) {
    autofillStatus.value = 'error'
    autofillMessage.value = 'Isi dulu nilainya sebelum mencari.'
    return
  }

  autofilling.value = true
  autofillStatus.value = 'idle'
  autofillMessage.value = ''
  try {
    const filled = await apiFetch<Record<string, string | number | boolean>>(
      `/api/public/${publishCode}/autofill`,
      {
        method: 'POST',
        body: {
          lookup,
          ...(koordinat.value ? { lat: koordinat.value.latitude, lng: koordinat.value.longitude } : {}),
        },
      },
    )
    // Field pemicu tidak ditimpa: yang baru saja diketik pengunjung yang benar.
    const applied: string[] = []
    for (const [fieldKey, value] of Object.entries(filled)) {
      if (fieldKey === key) continue
      values[fieldKey] = value
      applied.push(fieldKey)
    }
    autofilledKeys.value = applied
    autofillStatus.value = 'ok'
    autofillMessage.value = applied.length
      ? `${applied.length} isian terisi otomatis. Periksa kembali sebelum mengirim.`
      : 'Data ditemukan, tetapi tidak ada isian yang cocok.'
  }
  catch (e) {
    autofillStatus.value = 'error'
    autofillMessage.value = (e as Error).message
    autofilledKeys.value = []
  }
  finally {
    autofilling.value = false
  }
}

async function submit() {
  if (!selectedTypeId.value || submitting.value) return

  let sliderToken: string | undefined
  if (sliderRequired.value) {
    const tiket = await dialogRef.value?.mintaSlider()
    // Jendela verifikasi ditutup — isian tetap utuh, pengunjung bisa menekan lagi.
    if (!tiket) return
    sliderToken = tiket
  }

  submitting.value = true
  submitError.value = ''
  fieldErrors.value = {}

  try {
    const result = await apiFetch<{ token: string }>(`/api/public/${publishCode}/queue`, {
      method: 'POST',
      body: {
        queueTypeId: selectedTypeId.value,
        values,
        captchaToken: captchaToken.value || undefined,
        sliderToken,
        // Server memeriksa ulang pagar lokasinya; tombol yang tampil bukan izin.
        ...(koordinat.value ? { lat: koordinat.value.latitude, lng: koordinat.value.longitude } : {}),
      },
    })
    // Diingat supaya kunjungan berikutnya menampilkan nomor ini, bukan formulir kosong.
    tickets.remember(selectedTypeId.value, result.token)
    await navigateTo(`/queue/${result.token}`)
  }
  catch (e) {
    const err = e as ApiError
    submitError.value = err.message
    // token Turnstile sekali pakai — minta yang baru setelah gagal
    dialogRef.value?.resetTurnstile()
    if (err.errors) fieldErrors.value = err.errors
    if (err.code === 'EVENT_NOT_OPEN' || err.code === 'OUTSIDE_SERVICE_HOURS' || err.code === 'EVENT_PAUSED') {
      await refresh()
      dialogOpen.value = false
    }
  }
  finally {
    submitting.value = false
  }
}
</script>

<template>
  <div>
    <div v-if="error" class="mx-auto max-w-md px-4 py-20 text-center">
      <UIcon name="i-lucide-unplug" class="mx-auto size-12 text-slate-400" />
      <h1 class="mt-4 text-xl font-bold">
        Halaman tidak tersedia
      </h1>
      <p class="mt-2 text-slate-500">
        {{ (error as unknown as ApiError).message }}
      </p>
    </div>

    <PublicGeofenceGate
      v-else-if="terpagari && data"
      :page="data.page"
      :organization="data.organization"
      :geofence="data.geofence"
      :status="izinLokasi"
      @share="mintaLokasi"
    />

    <template v-else-if="view && data">
      <PublicPageRenderer :view="view" :tickets="myTickets" @select="pilihLayanan" />

      <PublicQueueDialog
        ref="dialogRef"
        v-model:open="dialogOpen"
        v-model:captcha-token="captchaToken"
        :service="selectedType"
        :ticket="selectedTicket"
        :fields="data.form?.fields ?? []"
        :form-description="data.form?.description"
        :values="values"
        :field-errors="fieldErrors"
        :submitting="submitting"
        :submit-error="submitError"
        :accepts-new="data.openState.acceptsNewQueue"
        :registration-enabled="data.features.publicRegistration"
        :turnstile-site-key="turnstileSiteKey"
        :turnstile-required="turnstileRequired"
        :slider-required="sliderRequired"
        :autofill-key="autofillKey"
        :autofilling="autofilling"
        :autofill-message="autofillMessage"
        :autofill-status="autofillStatus"
        :autofilled-keys="autofilledKeys"
        @submit="submit"
        @autofill="runAutofill"
        @again="daftarLagi"
      />
    </template>
  </div>
</template>
