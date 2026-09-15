<script setup lang="ts">
import type { PublicPageDraft } from '#shared/types/public-page'
import { BRANDING_PRESETS, matchPreset } from '#shared/constants/public-page'
import { accentOf } from '#shared/schemas/public-page'
import { SELECT_NONE, nullableValue } from '#shared/constants/ui'
import { formatDistance, mapsUrl, parseCoordinates } from '#shared/utils/geo'

/**
 * Panel setelan builder halaman publik.
 *
 * Disusun sebagai tab mendatar di atas pratinjau, bukan kolom di sampingnya:
 * pratinjau membutuhkan lebar penuh untuk menunjukkan tata letak desktop apa
 * adanya, dan setelan yang dijejalkan ke kolom 380px hanya menghasilkan satu
 * lajur isian yang panjang. Di sini isian satu bagian tersebar 2–3 kolom,
 * sehingga tinggi panelnya tetap pendek dan pratinjau tidak terdorong jauh.
 */
const props = defineProps<{
  queueTypes: Array<{ id: string, code: string, name: string }>
  mediaImages: Array<{ id: string, name: string, url: string }>
  mediaReadable: boolean
  /** Turnstile hanya bisa dinyalakan bila kuncinya sudah dipasang di server. */
  captchaConfigured: boolean
  isPublished: boolean
  publishCode: string
  publicUrl: string
  /** Tautan tetap dari slug; null selama slugnya belum diisi. */
  slugUrl: string | null
  /** Slug yang benar-benar tersimpan, untuk membandingkan dengan yang sedang diketik. */
  savedSlug: string
}>()

const emit = defineEmits<{
  regenerateQr: []
  rotateCode: []
  showQr: []
  remove: []
  copyUrl: [url: string]
}>()

const draft = defineModel<PublicPageDraft>({ required: true })

const BAGIAN = [
  { key: 'halaman', label: 'Halaman', icon: 'i-lucide-file-text' },
  { key: 'branding', label: 'Branding', icon: 'i-lucide-palette' },
  { key: 'hero', label: 'Hero', icon: 'i-lucide-image' },
  { key: 'layanan', label: 'Layanan', icon: 'i-lucide-layout-grid' },
  { key: 'informasi', label: 'Informasi', icon: 'i-lucide-info' },
  { key: 'antrean', label: 'Antrean', icon: 'i-lucide-ticket' },
  { key: 'lokasi', label: 'Lokasi', icon: 'i-lucide-map-pin' },
  { key: 'footer', label: 'Footer', icon: 'i-lucide-panel-bottom' },
  { key: 'lanjutan', label: 'Lanjutan', icon: 'i-lucide-settings-2' },
] as const

const aktif = ref<(typeof BAGIAN)[number]['key']>('halaman')

const theme = computed(() => draft.value.theme)

/* ---------------- gambar dari media library ---------------- */

/**
 * Yang disimpan adalah URL-nya, bukan id media — itulah yang dipakai halaman publik.
 * URL lama yang tidak lagi ada di media library tetap ditawarkan sebagai satu opsi,
 * supaya menyunting halaman tidak diam-diam menghapus gambarnya.
 */
function imageOptions(current: string) {
  const options = [
    { label: '— tanpa gambar —', value: SELECT_NONE },
    ...props.mediaImages.map(m => ({ label: m.name, value: m.url })),
  ]
  if (current && !props.mediaImages.some(m => m.url === current)) {
    options.push({ label: `${current} (di luar media library)`, value: current })
  }
  return options
}

function imageProxy(field: 'logoUrl' | 'backgroundUrl') {
  return computed({
    get: () => draft.value[field] || SELECT_NONE,
    set: (value: string) => { draft.value[field] = nullableValue(value) ?? '' },
  })
}
const logoValue = imageProxy('logoUrl')
const backgroundValue = imageProxy('backgroundUrl')

/* ---------------- paket warna ---------------- */

const presetAktif = computed(() =>
  matchPreset(theme.value.primaryColor, theme.value.secondaryColor, accentOf(theme.value)))

function pakaiPreset(key: string) {
  const preset = BRANDING_PRESETS.find(p => p.key === key)
  if (!preset) return
  draft.value.theme.primaryColor = preset.primary
  draft.value.theme.secondaryColor = preset.secondary
  draft.value.theme.accentColor = preset.accent
}

/* ---------------- pilihan bentuk tombol ---------------- */

const PERATAAN = [
  { value: 'left', label: 'Kiri', icon: 'i-lucide-align-left' },
  { value: 'center', label: 'Tengah', icon: 'i-lucide-align-center' },
  { value: 'right', label: 'Kanan', icon: 'i-lucide-align-right' },
] as const

const TINGGI = [
  { value: 'compact', label: 'Ringkas' },
  { value: 'medium', label: 'Sedang' },
  { value: 'large', label: 'Tinggi' },
] as const

const GAYA_KARTU = [
  { value: 'elevated', label: 'Berbayang' },
  { value: 'outlined', label: 'Bergaris' },
  { value: 'soft', label: 'Lembut' },
] as const

const typeOptions = computed(() =>
  props.queueTypes.map(t => ({ label: `${t.code} · ${t.name}`, value: t.id })))

/** Slug di kotak isian sudah berbeda dari yang tersimpan — tautannya belum berpindah. */
const slugBerubah = computed(() => draft.value.slug.trim() !== props.savedSlug)

/* ---------------- pagar lokasi (§36) ---------------- */

const RADIUS_CEPAT = [200, 500, 1000, 5000]

/** Apa yang diketik/ditempel admin; koordinatnya diurai dari sini. */
const titikTeks = ref('')
const titikGalat = ref('')
const mengambilLokasi = ref(false)

const titikTersimpan = computed(() =>
  draft.value.latitude !== null && draft.value.longitude !== null
    ? { latitude: draft.value.latitude, longitude: draft.value.longitude }
    : null)

/**
 * Admin boleh menempel apa saja yang ada di tangannya — tautan Google Maps atau
 * sepasang angka. Menyuruhnya menggali koordinat sendiri dari URL panjang adalah
 * cara tercepat mendapatkan titik yang meleset.
 */
function terapkanTitik() {
  const teks = titikTeks.value.trim()
  if (!teks) { titikGalat.value = ''; return }

  const titik = parseCoordinates(teks)
  if (!titik) {
    titikGalat.value = 'Tidak menemukan koordinat di teks itu. Tempel tautan Google Maps, atau tulis -6.2, 106.8.'
    return
  }

  titikGalat.value = ''
  draft.value.latitude = titik.latitude
  draft.value.longitude = titik.longitude
  titikTeks.value = ''
}

function ambilLokasiSaya() {
  if (!navigator.geolocation) {
    titikGalat.value = 'Peramban ini tidak bisa membaca lokasi.'
    return
  }
  mengambilLokasi.value = true
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      mengambilLokasi.value = false
      titikGalat.value = ''
      draft.value.latitude = pos.coords.latitude
      draft.value.longitude = pos.coords.longitude
    },
    () => {
      mengambilLokasi.value = false
      titikGalat.value = 'Lokasi tidak terbaca. Pastikan izin lokasi peramban menyala.'
    },
    { enableHighAccuracy: true, timeout: 15_000 },
  )
}

/** Mematikan pagarnya sekalian: pagar tanpa titik ditolak server. */
function hapusTitik() {
  draft.value.latitude = null
  draft.value.longitude = null
  draft.value.geofenceEnabled = false
}
</script>

<template>
  <div class="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
    <!-- Tab bagian; menggulir mendatar di layar sempit alih-alih membungkus jadi
         tiga baris yang memakan tinggi -->
    <div class="overflow-x-auto border-b border-slate-100 dark:border-slate-800">
      <div class="flex min-w-max gap-1 p-2" role="tablist" aria-label="Bagian halaman">
        <button
          v-for="b in BAGIAN"
          :key="b.key"
          type="button"
          role="tab"
          :aria-selected="aktif === b.key"
          class="inline-flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors"
          :class="aktif === b.key
            ? 'bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300'
            : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800'"
          @click="aktif = b.key"
        >
          <UIcon :name="b.icon" class="size-4" />
          {{ b.label }}
        </button>
      </div>
    </div>

    <div class="p-4">
      <!-- 1. HALAMAN -->
      <div v-if="aktif === 'halaman'" class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <UFormField label="Judul" required :hint="`${draft.title.length}/150`">
          <UInput v-model="draft.title" class="w-full" maxlength="150" placeholder="Galeri Inovasi AHU" />
        </UFormField>

        <UFormField label="Subjudul" :hint="`${draft.subtitle.length}/190`">
          <UInput v-model="draft.subtitle" class="w-full" maxlength="190" placeholder="Silakan ambil nomor antrean" />
        </UFormField>

        <UFormField
          label="Slug URL"
          help="Opsional. Mengisinya memberi halaman ini tautan kedua yang tetap — tidak ikut berubah saat kode QR diganti."
        >
          <UInput v-model="draft.slug" class="w-full" placeholder="galeri-inovasi-ahu" />
        </UFormField>

        <UFormField
          label="Deskripsi"
          class="sm:col-span-2"
          :hint="`${draft.description.length}/2000`"
          help="Satu paragraf pengantar di bawah judul."
        >
          <UTextarea v-model="draft.description" :rows="3" class="w-full" maxlength="2000" />
        </UFormField>

        <UFormField label="Layanan yang ditampilkan" help="Kosongkan untuk menampilkan semua layanan aktif.">
          <USelectMenu
            v-model="draft.allowedQueueTypeIds"
            :items="typeOptions"
            value-key="value"
            multiple
            placeholder="Semua layanan"
            class="w-full"
          />
        </UFormField>
      </div>

      <!-- 2. BRANDING -->
      <div v-else-if="aktif === 'branding'" class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <div class="sm:col-span-2 xl:col-span-3">
          <p class="mb-2 text-xs font-medium text-slate-500">
            Paket warna
          </p>
          <div class="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">
            <button
              v-for="preset in BRANDING_PRESETS"
              :key="preset.key"
              type="button"
              class="flex items-center gap-2 rounded-lg border p-2 text-left transition-colors"
              :class="presetAktif === preset.key
                ? 'border-brand-500 bg-brand-50 dark:bg-brand-950/60'
                : 'border-slate-200 hover:border-slate-300 dark:border-slate-700'"
              :title="preset.description"
              @click="pakaiPreset(preset.key)"
            >
              <span class="flex shrink-0 gap-0.5" aria-hidden="true">
                <span class="size-4 rounded-sm" :style="{ backgroundColor: preset.primary }" />
                <span class="size-4 rounded-sm" :style="{ backgroundColor: preset.accent }" />
              </span>
              <span class="min-w-0 flex-1 truncate text-xs font-medium">{{ preset.label }}</span>
            </button>
          </div>
          <p v-if="presetAktif === 'custom'" class="mt-2 text-xs text-slate-500">
            Warna diatur sendiri — memilih paket akan menimpanya.
          </p>
        </div>

        <UFormField label="Warna utama">
          <UiColorPicker v-model="draft.theme.primaryColor" label="Warna utama" />
        </UFormField>

        <UFormField label="Warna pendukung">
          <UiColorPicker v-model="draft.theme.secondaryColor" label="Warna pendukung" />
        </UFormField>

        <UFormField label="Warna aksen" help="Dipakai gradien hero. Kosong mengikuti warna utama.">
          <UiColorPicker
            :model-value="accentOf(draft.theme)"
            label="Warna aksen"
            @update:model-value="(v: string) => (draft.theme.accentColor = v)"
          />
        </UFormField>

        <UFormField label="Logo" hint="opsional">
          <div class="flex items-center gap-2">
            <USelectMenu
              v-if="mediaReadable && mediaImages.length"
              v-model="logoValue"
              :items="imageOptions(draft.logoUrl)"
              value-key="value"
              :search-input="{ placeholder: 'Cari berkas…' }"
              placeholder="Pilih dari media library"
              class="w-full"
            />
            <UInput v-else v-model="draft.logoUrl" class="w-full" placeholder="/media/logo.png" />
            <img
              v-if="draft.logoUrl"
              :src="draft.logoUrl"
              alt=""
              class="size-9 shrink-0 rounded border border-slate-200 object-contain dark:border-slate-800"
            >
          </div>
          <template #help>
            <span v-if="mediaReadable && !mediaImages.length">
              Media library masih kosong —
              <NuxtLink to="/admin/media" class="underline">unggah gambar dulu</NuxtLink>,
              atau tulis URL-nya langsung.
            </span>
          </template>
        </UFormField>

        <UFormField label="Gambar latar" hint="opsional">
          <div class="flex items-center gap-2">
            <USelectMenu
              v-if="mediaReadable && mediaImages.length"
              v-model="backgroundValue"
              :items="imageOptions(draft.backgroundUrl)"
              value-key="value"
              :search-input="{ placeholder: 'Cari berkas…' }"
              placeholder="Pilih dari media library"
              class="w-full"
            />
            <UInput v-else v-model="draft.backgroundUrl" class="w-full" placeholder="/media/latar.jpg" />
            <img
              v-if="draft.backgroundUrl"
              :src="draft.backgroundUrl"
              alt=""
              class="size-9 shrink-0 rounded border border-slate-200 object-cover dark:border-slate-800"
            >
          </div>
        </UFormField>

        <UFormField label="Font" help="Nama keluarga font CSS, mis. Inter.">
          <UInput v-model="draft.theme.fontFamily" class="w-full" placeholder="Inter" />
        </UFormField>
      </div>

      <!-- 3. HERO -->
      <div v-else-if="aktif === 'hero'" class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <div class="sm:col-span-2 xl:col-span-3">
          <USwitch v-model="draft.theme.hero.enabled" label="Tampilkan hero" />
          <p class="mt-1 text-xs text-slate-500">
            Dimatikan berarti halaman dibuka dengan kepala ringkas berisi logo dan judul saja.
          </p>
        </div>

        <template v-if="draft.theme.hero.enabled">
          <UFormField label="Judul hero" help="Kosongkan untuk memakai judul halaman.">
            <UInput v-model="draft.theme.hero.title" class="w-full" :placeholder="draft.title" maxlength="150" />
          </UFormField>

          <UFormField label="Subjudul hero" help="Kosongkan untuk memakai subjudul halaman.">
            <UInput v-model="draft.theme.hero.subtitle" class="w-full" :placeholder="draft.subtitle" maxlength="190" />
          </UFormField>

          <UFormField
            label="Teks tombol"
            :help="draft.theme.hero.ctaEnabled
              ? 'Tombol ini menggulir ke daftar layanan — pengunjung tetap memilih layanannya sendiri.'
              : 'Tombol sedang disembunyikan.'"
          >
            <UInput
              v-model="draft.theme.hero.ctaText"
              class="w-full"
              maxlength="60"
              :disabled="!draft.theme.hero.ctaEnabled"
              placeholder="Ambil Nomor Antrean"
            />
          </UFormField>

          <UFormField label="Deskripsi hero" class="sm:col-span-2" :hint="`${draft.theme.hero.description.length}/500`">
            <UTextarea v-model="draft.theme.hero.description" :rows="2" class="w-full" maxlength="500" />
          </UFormField>

          <UFormField label="Perataan">
            <div class="grid grid-cols-3 gap-2">
              <button
                v-for="opsi in PERATAAN"
                :key="opsi.value"
                type="button"
                class="flex items-center justify-center gap-1.5 rounded-lg border py-2 text-xs font-medium transition-colors"
                :class="draft.theme.hero.align === opsi.value
                  ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-950/60 dark:text-brand-300'
                  : 'border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:text-slate-300'"
                :aria-pressed="draft.theme.hero.align === opsi.value"
                @click="draft.theme.hero.align = opsi.value"
              >
                <UIcon :name="opsi.icon" class="size-4" />
                {{ opsi.label }}
              </button>
            </div>
          </UFormField>

          <UFormField label="Tinggi">
            <div class="grid grid-cols-3 gap-2">
              <button
                v-for="opsi in TINGGI"
                :key="opsi.value"
                type="button"
                class="rounded-lg border py-2 text-xs font-medium transition-colors"
                :class="draft.theme.hero.height === opsi.value
                  ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-950/60 dark:text-brand-300'
                  : 'border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:text-slate-300'"
                :aria-pressed="draft.theme.hero.height === opsi.value"
                @click="draft.theme.hero.height = opsi.value"
              >
                {{ opsi.label }}
              </button>
            </div>
          </UFormField>

          <!-- Kepekatan hanya berarti bila ada gambar; tanpa gambar hero memakai gradien -->
          <UFormField
            v-if="draft.backgroundUrl"
            label="Kepekatan lapisan"
            :hint="`${draft.theme.hero.overlay}%`"
            help="Makin pekat, makin terbaca teksnya di atas gambar."
          >
            <USlider v-model="draft.theme.hero.overlay" :min="0" :max="100" :step="2" />
          </UFormField>

          <div class="space-y-2 sm:col-span-2 xl:col-span-3">
            <p class="text-xs font-medium text-slate-500">
              Yang ditampilkan di hero
            </p>
            <div class="flex flex-wrap gap-x-6 gap-y-2">
              <USwitch v-model="draft.theme.hero.ctaEnabled" label="Tombol ajakan" />
              <USwitch v-model="draft.theme.hero.showDate" label="Tanggal event" />
              <USwitch v-model="draft.theme.hero.showTime" label="Jam layanan" />
              <USwitch v-model="draft.theme.hero.showLocation" label="Lokasi" />
            </div>
            <UFormField v-if="draft.theme.hero.showLocation" label="Lokasi" class="max-w-md">
              <UInput v-model="draft.theme.hero.location" class="w-full" maxlength="190" placeholder="Gedung A, Lantai 2" />
            </UFormField>
          </div>
        </template>
      </div>

      <!-- 4. LAYANAN -->
      <div v-else-if="aktif === 'layanan'" class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <UFormField label="Judul bagian">
          <UInput v-model="draft.theme.services.title" class="w-full" maxlength="120" placeholder="Pilih layanan" />
        </UFormField>

        <UFormField label="Subjudul bagian" hint="opsional">
          <UInput v-model="draft.theme.services.subtitle" class="w-full" maxlength="190" />
        </UFormField>

        <UFormField label="Jumlah kolom" help="Hanya di layar lebar; ponsel selalu satu kolom.">
          <div class="grid grid-cols-3 gap-2">
            <button
              v-for="n in [2, 3, 4]"
              :key="n"
              type="button"
              class="rounded-lg border py-2 text-xs font-medium transition-colors"
              :class="draft.theme.services.columns === n
                ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-950/60 dark:text-brand-300'
                : 'border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:text-slate-300'"
              :aria-pressed="draft.theme.services.columns === n"
              @click="draft.theme.services.columns = n"
            >
              {{ n }} kolom
            </button>
          </div>
        </UFormField>

        <UFormField label="Gaya kartu">
          <div class="grid grid-cols-3 gap-2">
            <button
              v-for="opsi in GAYA_KARTU"
              :key="opsi.value"
              type="button"
              class="rounded-lg border py-2 text-xs font-medium transition-colors"
              :class="draft.theme.services.cardStyle === opsi.value
                ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-950/60 dark:text-brand-300'
                : 'border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:text-slate-300'"
              :aria-pressed="draft.theme.services.cardStyle === opsi.value"
              @click="draft.theme.services.cardStyle = opsi.value"
            >
              {{ opsi.label }}
            </button>
          </div>
        </UFormField>

        <UFormField label="Gaya tombol kartu">
          <div class="grid grid-cols-2 gap-2">
            <button
              v-for="opsi in [{ value: 'button', label: 'Tombol' }, { value: 'link', label: 'Tautan' }] as const"
              :key="opsi.value"
              type="button"
              class="rounded-lg border py-2 text-xs font-medium transition-colors"
              :class="draft.theme.services.ctaStyle === opsi.value
                ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-950/60 dark:text-brand-300'
                : 'border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:text-slate-300'"
              :aria-pressed="draft.theme.services.ctaStyle === opsi.value"
              @click="draft.theme.services.ctaStyle = opsi.value"
            >
              {{ opsi.label }}
            </button>
          </div>
        </UFormField>

        <div class="flex flex-wrap gap-x-6 gap-y-2 sm:col-span-2 xl:col-span-3">
          <USwitch v-model="draft.theme.services.showIcon" label="Ikon layanan" />
          <USwitch v-model="draft.theme.services.showWaiting" label="Jumlah menunggu" />
          <USwitch v-model="draft.theme.services.showEstimate" label="Estimasi tunggu" />
        </div>
      </div>

      <!-- 5. INFORMASI -->
      <div v-else-if="aktif === 'informasi'" class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <UFormField label="Judul bagian">
          <UInput v-model="draft.theme.info.title" class="w-full" maxlength="120" placeholder="Informasi layanan" />
        </UFormField>

        <UFormField label="Tampilan">
          <div class="grid grid-cols-2 gap-2">
            <button
              v-for="opsi in [{ value: 'cards', label: 'Kartu' }, { value: 'plain', label: 'Satu blok' }] as const"
              :key="opsi.value"
              type="button"
              class="rounded-lg border py-2 text-xs font-medium transition-colors"
              :class="draft.theme.info.style === opsi.value
                ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-950/60 dark:text-brand-300'
                : 'border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:text-slate-300'"
              :aria-pressed="draft.theme.info.style === opsi.value"
              @click="draft.theme.info.style = opsi.value"
            >
              {{ opsi.label }}
            </button>
          </div>
        </UFormField>

        <UFormField
          label="Isi informasi"
          class="sm:col-span-2 xl:col-span-3"
          help="Satu baris = satu butir. Ditampilkan sebagai teks biasa; markup HTML tidak dirender."
        >
          <UTextarea
            v-model="draft.infoHtml"
            :rows="4"
            class="w-full"
            maxlength="5000"
            placeholder="Bawa fotokopi KTP&#10;Istirahat 12.00 – 13.00"
          />
        </UFormField>
      </div>

      <!-- 6. ANTREAN -->
      <div v-else-if="aktif === 'antrean'" class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <UFormField label="Batas per IP per hari" help="0 = tanpa batas.">
          <UInputNumber v-model="draft.maxPerIpPerDay" :min="0" :max="1000" class="w-full" />
        </UFormField>

        <div>
          <UCheckbox
            v-model="draft.requireCaptcha"
            :disabled="!captchaConfigured"
            label="Wajib verifikasi Turnstile"
          />
          <p v-if="!captchaConfigured" class="mt-1 text-xs text-slate-400">
            Isi TURNSTILE_SITE_KEY dan TURNSTILE_SECRET_KEY pada .env untuk mengaktifkan.
          </p>
        </div>

        <div class="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-300">
          <p class="font-medium">
            Formulir pengunjung & captcha geser
          </p>
          <p class="mt-1">
            Isian yang harus diisi pengunjung dan verifikasi geser diatur pada
            <NuxtLink to="/admin/forms" class="underline">Form Builder</NuxtLink> —
            keduanya mengikuti formulir aktif event ini.
          </p>
        </div>
      </div>

      <!-- 7. LOKASI -->
      <div v-else-if="aktif === 'lokasi'" class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <div class="sm:col-span-2 xl:col-span-3">
          <USwitch
            v-model="draft.geofenceEnabled"
            :disabled="!titikTersimpan"
            label="Batasi akses berdasarkan lokasi"
          />
          <p class="mt-1 text-xs text-slate-500">
            <template v-if="!titikTersimpan">
              Tentukan titik lokasi dulu di bawah, baru sakelar ini bisa dinyalakan.
            </template>
            <template v-else-if="draft.geofenceEnabled">
              Halaman hanya terbuka bagi pengunjung dalam jarak
              {{ formatDistance(draft.geofenceRadiusM) }} dari titik ini. Pengunjung diminta
              membagikan lokasinya, dan jaraknya diperiksa ulang di server.
            </template>
            <template v-else>
              Halaman terbuka untuk siapa saja yang punya tautannya.
            </template>
          </p>
        </div>

        <UFormField
          label="Titik lokasi"
          class="sm:col-span-2"
          :error="titikGalat || undefined"
          help="Tempel tautan Google Maps, atau tulis koordinat seperti -6.2088, 106.8456."
        >
          <div class="flex flex-wrap gap-2">
            <UInput
              v-model="titikTeks"
              class="min-w-48 flex-1"
              placeholder="Tautan Google Maps atau -6.2088, 106.8456"
              @keydown.enter.prevent="terapkanTitik"
              @blur="terapkanTitik"
            />
            <UButton
              icon="i-lucide-check"
              variant="outline"
              color="neutral"
              label="Pakai"
              :disabled="!titikTeks.trim()"
              @click="terapkanTitik"
            />
            <UButton
              icon="i-lucide-crosshair"
              variant="outline"
              color="neutral"
              label="Lokasi saya"
              :loading="mengambilLokasi"
              @click="ambilLokasiSaya"
            />
          </div>
        </UFormField>

        <UFormField label="Radius" :hint="formatDistance(draft.geofenceRadiusM)">
          <UInputNumber v-model="draft.geofenceRadiusM" :min="50" :max="50000" :step="50" class="w-full" />
          <template #help>
            <div class="mt-1 flex flex-wrap gap-1">
              <button
                v-for="r in RADIUS_CEPAT"
                :key="r"
                type="button"
                class="rounded-md border px-2 py-0.5 text-xs transition-colors"
                :class="draft.geofenceRadiusM === r
                  ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-950/60 dark:text-brand-300'
                  : 'border-slate-200 text-slate-500 hover:border-slate-300 dark:border-slate-700'"
                @click="draft.geofenceRadiusM = r"
              >
                {{ formatDistance(r) }}
              </button>
            </div>
          </template>
        </UFormField>

        <div class="sm:col-span-2 xl:col-span-3">
          <div
            v-if="titikTersimpan"
            class="flex flex-wrap items-center gap-3 rounded-lg bg-slate-50 p-3 dark:bg-slate-800/50"
          >
            <UIcon name="i-lucide-map-pin" class="size-4 shrink-0 text-slate-400" />
            <code class="text-xs">{{ titikTersimpan.latitude.toFixed(6) }}, {{ titikTersimpan.longitude.toFixed(6) }}</code>
            <a
              :href="mapsUrl(titikTersimpan)"
              target="_blank"
              rel="noopener noreferrer"
              class="text-xs font-semibold text-primary underline-offset-4 hover:underline"
            >
              Periksa di peta
            </a>
            <UButton
              class="ml-auto"
              size="xs"
              variant="ghost"
              color="error"
              icon="i-lucide-x"
              label="Hapus titik"
              @click="hapusTitik"
            />
          </div>
          <div
            v-else
            class="rounded-lg border border-dashed border-slate-300 p-3 text-xs text-slate-500 dark:border-slate-700"
          >
            Belum ada titik lokasi.
          </div>
        </div>

        <div class="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 sm:col-span-2 xl:col-span-3 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
          <p class="font-medium">
            Pagar lokasi menahan, bukan mengunci
          </p>
          <p class="mt-1">
            Koordinat dikirim oleh peramban pengunjung dan bisa dipalsukan dengan aplikasi GPS palsu.
            Ini menaikkan usaha yang dibutuhkan — sekelas captcha — bukan bukti keberadaan seseorang.
            Peramban juga hanya mengizinkan pembacaan lokasi lewat HTTPS.
          </p>
        </div>
      </div>

      <!-- 8. FOOTER -->
      <div v-else-if="aktif === 'footer'" class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <UFormField label="Teks footer" hint="opsional">
          <UInput v-model="draft.theme.footerText" class="w-full" maxlength="190" placeholder="Dikelola oleh Bagian Pelayanan" />
        </UFormField>

        <div class="flex flex-wrap gap-x-6 gap-y-2 sm:col-span-2">
          <USwitch v-model="draft.theme.footer.showLogo" label="Logo" />
          <USwitch v-model="draft.theme.footer.showOrganization" label="Nama instansi" />
          <USwitch v-model="draft.theme.footer.showPoweredBy" label='"Ditenagai ANTREAN"' />
        </div>
      </div>

      <!-- 9. LANJUTAN -->
      <div v-else class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <div class="sm:col-span-2">
          <p class="mb-1 text-xs font-medium text-slate-500">
            Tautan halaman
          </p>

          <!--
            Dua alamat untuk satu halaman, dipisah supaya bedanya jelas: yang atas
            tercetak di QR dan bisa diganti kapan saja, yang bawah tetap.
          -->
          <div class="space-y-2">
            <div>
              <div class="flex items-center gap-2 rounded-lg bg-slate-50 p-2 dark:bg-slate-800/50">
                <UIcon name="i-lucide-qr-code" class="size-4 shrink-0 text-slate-400" />
                <code class="min-w-0 flex-1 truncate text-xs">{{ publicUrl }}</code>
                <UButton
                  icon="i-lucide-copy"
                  aria-label="Salin tautan kode publikasi"
                  title="Salin tautan kode publikasi"
                  size="xs"
                  variant="ghost"
                  color="neutral"
                  @click="emit('copyUrl', publicUrl)"
                />
              </div>
              <p class="mt-1 text-xs text-slate-500">
                Tautan QR — kode <b class="font-mono">{{ publishCode }}</b>, bisa diganti kapan saja.
              </p>
            </div>

            <div>
              <div
                v-if="slugUrl"
                class="flex items-center gap-2 rounded-lg bg-slate-50 p-2 dark:bg-slate-800/50"
              >
                <UIcon name="i-lucide-link" class="size-4 shrink-0 text-slate-400" />
                <code class="min-w-0 flex-1 truncate text-xs">{{ slugUrl }}</code>
                <UButton
                  icon="i-lucide-copy"
                  aria-label="Salin tautan tetap"
                  title="Salin tautan tetap"
                  size="xs"
                  variant="ghost"
                  color="neutral"
                  @click="emit('copyUrl', slugUrl)"
                />
              </div>
              <div
                v-else
                class="rounded-lg border border-dashed border-slate-300 p-2 text-xs text-slate-500 dark:border-slate-700"
              >
                Belum ada tautan tetap. Isi <b>Slug URL</b> di bagian Halaman untuk membuatnya.
              </div>
              <p v-if="slugUrl" class="mt-1 text-xs text-slate-500">
                Tautan tetap — tidak ikut berubah saat kode publikasi diganti.
              </p>
              <p v-if="slugBerubah" class="mt-1 text-xs text-amber-600 dark:text-amber-400">
                Slug yang sedang diketik baru berlaku setelah disimpan.
              </p>
            </div>
          </div>

          <div class="mt-3 flex flex-wrap gap-2">
            <UButton size="sm" icon="i-lucide-qr-code" variant="outline" color="neutral" label="QR Code" @click="emit('showQr')" />
            <UButton size="sm" icon="i-lucide-refresh-cw" variant="outline" color="neutral" label="Perbarui QR" @click="emit('regenerateQr')" />
          </div>
        </div>

        <div class="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
          <p class="font-medium">
            Ganti tautan & QR
          </p>
          <p class="mt-1">
            Kode publikasi diganti; QR lama yang sudah tercetak tidak lagi berfungsi.
          </p>
          <UButton
            class="mt-2"
            size="xs"
            icon="i-lucide-shuffle"
            color="warning"
            variant="soft"
            label="Ganti tautan & QR"
            @click="emit('rotateCode')"
          />
          <div class="mt-4 border-t border-amber-200 pt-3 dark:border-amber-900/60">
            <UButton
              size="xs"
              icon="i-lucide-trash-2"
              color="error"
              variant="ghost"
              label="Hapus halaman"
              @click="emit('remove')"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
