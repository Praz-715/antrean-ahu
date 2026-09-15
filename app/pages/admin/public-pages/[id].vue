<script setup lang="ts">
import { apiFetch } from '../../../composables/useApi'
import { PERMISSIONS } from '#shared/constants/permissions'
import { parsePublicPageTheme } from '#shared/schemas/public-page'
import type { PreviewDevice, PublicPageDraft, PublicPageView, PublicServiceView } from '#shared/types/public-page'

definePageMeta({ layout: 'admin', middleware: 'admin' })

/**
 * Builder halaman publik.
 *
 * Panel setelan di atas, halaman sungguhan di bawahnya dengan lebar penuh.
 * Pratinjaunya memakai `PublicPageRenderer` yang sama dengan yang dilihat
 * pengunjung, jadi tidak ada jalan bagi keduanya untuk berbeda — dan admin tidak
 * perlu menyimpan lalu membuka tab baru hanya untuk tahu hasilnya.
 */
const route = useRoute()
const pageId = route.params.id as string

const { can } = useMe()
const { call } = useApi()
const toast = useToast()

interface PublicPageRow {
  id: string
  publishCode: string
  slug: string | null
  title: string
  subtitle: string | null
  description: string | null
  isPublished: boolean
  maxPerIpPerDay: number
  requireCaptcha: boolean
  geofenceEnabled: boolean
  latitude: number | null
  longitude: number | null
  geofenceRadiusM: number
  allowedQueueTypeIds: string[] | null
  infoHtml: string | null
  logoUrl: string | null
  backgroundUrl: string | null
  theme: unknown
  url: string
  /** Tautan tetap dari slug; null bila slugnya belum diisi. */
  slugUrl: string | null
  event: { id: string, name: string, status: string }
  qrCodes: Array<{ id: string, version: number }>
}

interface AdminQueueType {
  id: string
  code: string
  name: string
  description: string | null
  color: string
  icon: string | null
  isActive: boolean
  estServiceSeconds: number
}

interface EventDetail {
  id: string
  name: string
  startDate: string | null
  endDate: string | null
  branding: Record<string, unknown> | null
  organization?: { name: string, logoUrl: string | null } | null
  openState: PublicPageView['openState']
}

const page = ref<PublicPageRow | null>(null)
const queueTypes = ref<AdminQueueType[]>([])
const mediaImages = ref<Array<{ id: string, name: string, url: string }>>([])
const mediaReadable = ref(true)
const eventDetail = ref<EventDetail | null>(null)
/**
 * Data publik yang benar-benar tersaji hari ini; hanya ada bila halaman sudah terbit.
 *
 * Halaman yang dipagari lokasi menjawab dengan isi terbatas selama peminta belum
 * terbukti berada di dalam jangkauan — dan admin yang sedang menyusun tampilan
 * biasanya tidak sedang berdiri di lokasi layanan. Jawaban seperti itu diperlakukan
 * sebagai "tidak ada data langsung", bukan dipaksa dibaca.
 */
interface LivePublic {
  access: 'granted' | 'geofenced'
  queueTypes?: PublicServiceView[]
  openState?: PublicPageView['openState']
  organization: { name: string, logoUrl: string | null } | null
}
const livePublic = ref<LivePublic | null>(null)

const pending = ref(true)
const saving = ref(false)

const draft = ref<PublicPageDraft>(kosong())

function kosong(): PublicPageDraft {
  return {
    title: '',
    subtitle: '',
    description: '',
    slug: '',
    infoHtml: '',
    logoUrl: '',
    backgroundUrl: '',
    allowedQueueTypeIds: [],
    maxPerIpPerDay: 5,
    requireCaptcha: false,
    geofenceEnabled: false,
    latitude: null,
    longitude: null,
    geofenceRadiusM: 1000,
    theme: parsePublicPageTheme({}),
  }
}

/** Salinan keadaan tersimpan, untuk tahu apakah ada perubahan yang belum disimpan. */
const tersimpan = ref('')
const dirty = computed(() => JSON.stringify(draft.value) !== tersimpan.value)

function isiDraft(row: PublicPageRow) {
  draft.value = {
    title: row.title,
    subtitle: row.subtitle ?? '',
    description: row.description ?? '',
    slug: row.slug ?? '',
    infoHtml: row.infoHtml ?? '',
    logoUrl: row.logoUrl ?? '',
    backgroundUrl: row.backgroundUrl ?? '',
    allowedQueueTypeIds: row.allowedQueueTypeIds ?? [],
    maxPerIpPerDay: row.maxPerIpPerDay,
    requireCaptcha: row.requireCaptcha,
    geofenceEnabled: row.geofenceEnabled,
    latitude: row.latitude,
    longitude: row.longitude,
    geofenceRadiusM: row.geofenceRadiusM,
    theme: parsePublicPageTheme(row.theme),
  }
  tersimpan.value = JSON.stringify(draft.value)
}

/**
 * Dimuat di peramban, bukan saat render server.
 *
 * Permintaan kedua di sini bergantung pada hasil permintaan pertama (id event dan
 * kode publikasi), dan `apiFetch` yang dipanggil setelah `await` di dalam setup
 * kehilangan konteks Nuxt — render servernya jatuh menjadi galat 500. Builder ini
 * pun berada di balik autentikasi, jadi tidak ada yang hilang dengan memuatnya
 * setelah halaman tampil.
 */
async function load() {
  pending.value = true
  try {
    const row = await apiFetch<PublicPageRow>(`/api/admin/public-pages/${pageId}`)
    page.value = row
    isiDraft(row)

    /**
     * Sisa datanya diminta BERSAMAAN. Media dan data publik boleh gagal tanpa
     * menjatuhkan builder: yang pertama bergantung izin, yang kedua hanya ada
     * bila halamannya sudah terbit.
     */
    const [types, media, detail, live] = await Promise.all([
      apiFetch<AdminQueueType[]>('/api/admin/queue-types', { query: { eventId: row.event.id } }),
      apiFetch<typeof mediaImages.value>('/api/admin/media', { query: { type: 'IMAGE' } }).catch(() => null),
      apiFetch<EventDetail>(`/api/admin/events/${row.event.id}`).catch(() => null),
      row.isPublished
        ? apiFetch<LivePublic>(`/api/public/${row.publishCode}`).catch(() => null)
        : Promise.resolve(null),
    ])

    queueTypes.value = types
    mediaReadable.value = media !== null
    mediaImages.value = media ?? []
    eventDetail.value = detail
    livePublic.value = live?.access === 'granted' ? live : null
  }
  finally { pending.value = false }
}

onMounted(() => { void load() })

useHead(() => ({ title: page.value ? `Susun ${page.value.title}` : 'Builder Halaman' }))

/* ---------------- pratinjau ---------------- */

const device = ref<PreviewDevice>('desktop')

/**
 * Di layar sempit, pratinjau dibuka pada lebar ponsel.
 *
 * Halaman desktop yang diperkecil sampai seperempat memang jujur, tetapi tidak ada
 * yang bisa dibaca darinya — dan admin yang membuka builder dari ponsel hampir
 * pasti sedang memeriksa tampilan ponsel.
 */
onMounted(() => {
  if (window.innerWidth < 1024) device.value = 'mobile'
})

/**
 * Layanan yang tampil di pratinjau.
 *
 * Jumlah menunggu diambil dari data publik yang sedang tersaji bila halamannya
 * sudah terbit — itu angka sungguhan. Untuk halaman draf belum ada yang bisa
 * diambil, jadi nol; bukan angka karangan yang membuat pratinjau tampak ramai
 * padahal tidak.
 */
const layananPratinjau = computed<PublicServiceView[]>(() => {
  const dipilih = draft.value.allowedQueueTypeIds
  return queueTypes.value
    .filter(t => t.isActive && (!dipilih.length || dipilih.includes(t.id)))
    .map(t => ({
      id: t.id,
      code: t.code,
      name: t.name,
      description: t.description,
      color: t.color,
      icon: t.icon,
      estServiceSeconds: t.estServiceSeconds,
      waitingCount: livePublic.value?.queueTypes?.find(q => q.id === t.id)?.waitingCount ?? 0,
    }))
})

const previewView = computed<PublicPageView>(() => {
  const warisan = (eventDetail.value?.branding ?? {}) as { primaryColor?: string, secondaryColor?: string, fontFamily?: string, footerText?: string }
  const theme = draft.value.theme

  return {
    page: {
      title: draft.value.title || 'Judul halaman',
      subtitle: draft.value.subtitle || null,
      description: draft.value.description || null,
      logoUrl: draft.value.logoUrl || null,
      backgroundUrl: draft.value.backgroundUrl || null,
      infoHtml: draft.value.infoHtml || null,
      theme: {
        ...theme,
        // Nilai yang dikosongkan di halaman diturunkan dari branding event (§48).
        primaryColor: theme.primaryColor || warisan.primaryColor || '#1b5cf5',
        secondaryColor: theme.secondaryColor || warisan.secondaryColor || '#0f172a',
        fontFamily: theme.fontFamily || warisan.fontFamily || '',
        footerText: theme.footerText || warisan.footerText || '',
      },
    },
    organization: livePublic.value?.organization ?? eventDetail.value?.organization ?? null,
    event: {
      name: eventDetail.value?.name ?? page.value?.event.name ?? '',
      startDate: eventDetail.value?.startDate ?? null,
      endDate: eventDetail.value?.endDate ?? null,
    },
    openState: livePublic.value?.openState
      ?? eventDetail.value?.openState
      ?? { isOpen: false, acceptsNewQueue: false, message: 'Status layanan belum diketahui', openTime: null, closeTime: null, serviceDate: '' },
    queueTypes: layananPratinjau.value,
    features: { publicRegistration: true },
  }
})

/* ---------------- aksi ---------------- */

async function save() {
  saving.value = true
  const body = {
    title: draft.value.title,
    subtitle: draft.value.subtitle || null,
    description: draft.value.description || null,
    slug: draft.value.slug || null,
    infoHtml: draft.value.infoHtml || null,
    logoUrl: draft.value.logoUrl || null,
    backgroundUrl: draft.value.backgroundUrl || null,
    theme: draft.value.theme,
    allowedQueueTypeIds: draft.value.allowedQueueTypeIds,
    maxPerIpPerDay: Number(draft.value.maxPerIpPerDay),
    requireCaptcha: draft.value.requireCaptcha,
    geofenceEnabled: draft.value.geofenceEnabled,
    latitude: draft.value.latitude,
    longitude: draft.value.longitude,
    geofenceRadiusM: Number(draft.value.geofenceRadiusM),
  }
  const res = await call<PublicPageRow>(`/api/admin/public-pages/${pageId}`, { method: 'PATCH', body }, 'Halaman disimpan')
  saving.value = false
  if (res) { page.value = res; isiDraft(res) }
}

async function togglePublish() {
  if (!page.value) return
  const res = await call<PublicPageRow>(
    `/api/admin/public-pages/${pageId}/publish`,
    { method: 'POST', body: { isPublished: !page.value.isPublished } },
    page.value.isPublished ? 'Publikasi dihentikan' : 'Halaman dipublikasikan',
  )
  if (res) { page.value = res; await load() }
}

const qrOpen = ref(false)
const qrVersion = ref(0)
const qrSrc = computed(() => `/api/admin/public-pages/${pageId}/qr?format=png&size=600&v=${qrVersion.value}`)

async function regenerateQr(rotateCode: boolean) {
  await call(
    `/api/admin/public-pages/${pageId}/qr`,
    { method: 'POST', body: { rotateCode } },
    rotateCode ? 'Tautan & QR baru dibuat' : 'QR diperbarui',
  )
  await load()
  qrVersion.value++
}

/**
 * Mengganti tautan tidak bisa dibatalkan: seluruh QR yang sudah tercetak dan
 * ditempel di lokasi langsung mati. Satu klik tanpa konfirmasi terlalu murah untuk
 * akibat sebesar itu.
 */
const rotateOpen = ref(false)

const deleteOpen = ref(false)
const deleting = ref(false)
async function confirmDelete() {
  deleting.value = true
  const res = await call(`/api/admin/public-pages/${pageId}`, { method: 'DELETE' }, 'Halaman dihapus')
  deleting.value = false
  if (res) await navigateTo('/admin/public-pages')
}

async function copyUrl(url: string) {
  await navigator.clipboard.writeText(url)
  toast.add({ title: 'Tautan disalin', color: 'success', icon: 'i-lucide-copy' })
}

const captchaConfigured = computed(() => !!useRuntimeConfig().public.turnstileSiteKey)

/**
 * Meninggalkan halaman dengan perubahan yang belum disimpan harus disengaja.
 * Builder ini mudah ditinggalkan tanpa sadar — satu klik di menu samping.
 */
onBeforeRouteLeave(() => {
  if (!dirty.value) return true
  return window.confirm('Ada perubahan yang belum disimpan. Tinggalkan halaman ini?')
})
</script>

<template>
  <div>
    <UiPageHeading
      :title="page?.title || 'Halaman Publik'"
      icon="i-lucide-layout-template"
      description="Susun tampilan halaman yang dibuka pengunjung. Pratinjau di bawah memakai komponen yang sama dengan halaman sungguhan."
    >
      <template #actions>
        <UButton
          to="/admin/public-pages"
          icon="i-lucide-arrow-left"
          variant="ghost"
          color="neutral"
          label="Semua Halaman"
        />
        <UBadge
          variant="subtle"
          :color="page?.isPublished ? 'success' : 'neutral'"
          :label="page?.isPublished ? 'Terbit' : 'Draf'"
        />
        <UButton
          v-if="page?.isPublished"
          :to="page.url"
          target="_blank"
          icon="i-lucide-external-link"
          variant="outline"
          color="neutral"
          label="Buka"
        />
        <UiActionButton
          v-if="can(PERMISSIONS.PUBLIC_PAGE_PUBLISH)"
          :icon="page?.isPublished ? 'i-lucide-eye-off' : 'i-lucide-globe'"
          :color="page?.isPublished ? 'warning' : 'primary'"
          variant="soft"
          :label="page?.isPublished ? 'Hentikan' : 'Publikasikan'"
          :action="togglePublish"
        />
        <UButton
          v-if="can(PERMISSIONS.PUBLIC_PAGE_MANAGE)"
          icon="i-lucide-save"
          :loading="saving"
          :disabled="!dirty || draft.title.trim().length < 2"
          :label="dirty ? 'Simpan' : 'Tersimpan'"
          @click="save"
        />
      </template>
    </UiPageHeading>

    <div v-if="pending" class="space-y-4">
      <USkeleton class="h-48" />
      <USkeleton class="h-96" />
    </div>

    <template v-else-if="page">
      <div class="space-y-4">
        <PagebuilderPanel
          v-model="draft"
          :queue-types="queueTypes"
          :media-images="mediaImages"
          :media-readable="mediaReadable"
          :captcha-configured="captchaConfigured"
          :is-published="page.isPublished"
          :publish-code="page.publishCode"
          :public-url="page.url"
          :slug-url="page.slugUrl"
          :saved-slug="page.slug ?? ''"
          @regenerate-qr="regenerateQr(false)"
          @rotate-code="rotateOpen = true"
          @show-qr="qrOpen = true"
          @remove="deleteOpen = true"
          @copy-url="copyUrl"
        />

        <!--
          Pratinjau mendapat lebar penuh. Berdampingan dengan panel setelan, halaman
          desktop harus diperkecil jauh dan tetap menyisakan lajur setelan yang
          sempit — dua-duanya jadi sesak tanpa alasan.
        -->
        <div class="h-[70vh] min-h-[520px]">
          <PagebuilderPreview v-model:device="device" :view="previewView" />
        </div>
      </div>
    </template>

    <UModal v-model:open="qrOpen" :title="page?.title" description="Pindai untuk membuka halaman pengambilan antrean.">
      <template #body>
        <div class="text-center">
          <img :src="qrSrc" alt="QR Code" class="mx-auto size-64 rounded-xl border border-slate-200 bg-white p-2 dark:border-slate-700">
          <code class="mt-3 block break-all text-xs text-slate-500">{{ page?.url }}</code>
          <div class="mt-4 flex flex-wrap justify-center gap-2">
            <UButton
              size="sm"
              icon="i-lucide-download"
              variant="outline"
              color="neutral"
              label="PNG"
              :to="`/api/admin/public-pages/${pageId}/qr?format=png&size=1200&download=true`"
              external
            />
            <UButton
              size="sm"
              icon="i-lucide-download"
              variant="outline"
              color="neutral"
              label="SVG"
              :to="`/api/admin/public-pages/${pageId}/qr?format=svg&download=true`"
              external
            />
          </div>
        </div>
      </template>
    </UModal>

    <UModal
      v-model:open="rotateOpen"
      title="Ganti tautan & QR?"
      description="Kode publikasi diganti dengan yang baru. Seluruh QR yang sudah dicetak dan tautan yang sudah dibagikan tidak akan berfungsi lagi."
    >
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton variant="ghost" color="neutral" label="Batal" @click="rotateOpen = false" />
          <UiActionButton
            color="warning"
            icon="i-lucide-shuffle"
            label="Ganti sekarang"
            :action="async () => { await regenerateQr(true); rotateOpen = false }"
          />
        </div>
      </template>
    </UModal>

    <UModal
      v-model:open="deleteOpen"
      title="Hapus halaman publik?"
      :description="`&quot;${page?.title}&quot; akan dihapus dan tautannya tidak dapat diakses lagi.`"
    >
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton variant="ghost" color="neutral" label="Batal" @click="deleteOpen = false" />
          <UButton color="error" :loading="deleting" label="Hapus" @click="confirmDelete" />
        </div>
      </template>
    </UModal>
  </div>
</template>
