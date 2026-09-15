<script setup lang="ts">
import { apiFetch } from '../../../composables/useApi'
import { PERMISSIONS } from '#shared/constants/permissions'
import { formatDistance } from '#shared/utils/geo'

definePageMeta({ layout: 'admin', middleware: 'admin' })
useHead({ title: 'Halaman Publik' })

/**
 * Daftar halaman publik.
 *
 * Penyuntingannya tidak lagi di modal ini melainkan di builder
 * (`/admin/public-pages/{id}`): setelan tampilan hanya masuk akal bila hasilnya
 * terlihat, dan itu tidak muat di dalam dialog. Yang tersisa di sini hanya yang
 * memang berupa daftar — membuat, membuka, memublikasikan, dan QR.
 */
interface PublicPageRow {
  id: string
  publishCode: string
  slug: string | null
  title: string
  subtitle: string | null
  isPublished: boolean
  maxPerIpPerDay: number
  geofenceEnabled: boolean
  geofenceRadiusM: number
  allowedQueueTypeIds: string[] | null
  logoUrl: string | null
  backgroundUrl: string | null
  theme: { primaryColor?: string, secondaryColor?: string } | null
  url: string
  slugUrl: string | null
  event: { id: string, name: string, status: string }
  qrCodes: Array<{ id: string, version: number }>
}

const { can } = useMe()
const { call } = useApi()
const toast = useToast()
const { currentId, loadEvents } = useCurrentEvent()
await loadEvents()

const pages = ref<PublicPageRow[]>([])
const pending = ref(false)

async function load() {
  if (!currentId.value) { pages.value = []; return }
  pending.value = true
  try {
    pages.value = await apiFetch<PublicPageRow[]>('/api/admin/public-pages', {
      query: { eventId: currentId.value },
    })
  }
  finally { pending.value = false }
}
watch(currentId, load, { immediate: true })

/* ---------------- buat halaman ---------------- */

const createOpen = ref(false)
const creating = ref(false)
const newTitle = ref('')

/**
 * Membuat halaman hanya meminta judulnya.
 *
 * Sisanya diatur di builder dengan hasil yang langsung terlihat — menanyakan warna
 * dan tata letak di dalam dialog kosong, sebelum ada apa pun untuk dilihat, hanya
 * membuat admin menebak.
 */
async function createPage() {
  creating.value = true
  const res = await call<{ id: string }>(
    '/api/admin/public-pages',
    { method: 'POST', body: { eventId: currentId.value, title: newTitle.value.trim() } },
    'Halaman dibuat',
  )
  creating.value = false
  if (res) {
    createOpen.value = false
    newTitle.value = ''
    await navigateTo(`/admin/public-pages/${res.id}`)
  }
}

async function togglePublish(page: PublicPageRow) {
  await call(
    `/api/admin/public-pages/${page.id}/publish`,
    { method: 'POST', body: { isPublished: !page.isPublished } },
    page.isPublished ? 'Publikasi dihentikan' : 'Halaman dipublikasikan',
  )
  await load()
}

const deleteTarget = ref<PublicPageRow | null>(null)
const deleting = ref(false)
async function confirmDelete() {
  if (!deleteTarget.value) return
  deleting.value = true
  const res = await call(`/api/admin/public-pages/${deleteTarget.value.id}`, { method: 'DELETE' }, 'Halaman dihapus')
  deleting.value = false
  if (res) { deleteTarget.value = null; await load() }
}

/* ---------------- QR ---------------- */

const qrTarget = ref<PublicPageRow | null>(null)
const qrVersion = ref(0)
const qrSrc = computed(() =>
  qrTarget.value ? `/api/admin/public-pages/${qrTarget.value.id}/qr?format=png&size=600&v=${qrVersion.value}` : '')

async function regenerateQr(page: PublicPageRow, rotateCode: boolean) {
  await call(
    `/api/admin/public-pages/${page.id}/qr`,
    { method: 'POST', body: { rotateCode } },
    rotateCode ? 'Tautan & QR baru dibuat' : 'QR diperbarui',
  )
  await load()
  qrVersion.value++
}

async function copyUrl(url: string) {
  await navigator.clipboard.writeText(url)
  toast.add({ title: 'Tautan disalin', color: 'success', icon: 'i-lucide-copy' })
}

function printQr() {
  if (!qrTarget.value) return
  const win = window.open('', '_blank', 'width=800,height=900')
  if (!win) return
  win.document.write(`
    <html><head><title>QR ${qrTarget.value.title}</title>
    <style>
      body { font-family: system-ui, sans-serif; text-align: center; padding: 48px; }
      h1 { font-size: 28px; margin: 0 0 4px; }
      p { color: #64748b; margin: 0 0 24px; }
      img { width: 380px; height: 380px; }
      .url { margin-top: 16px; font-family: monospace; font-size: 14px; }
    </style></head>
    <body>
      <h1>${qrTarget.value.title}</h1>
      <p>${qrTarget.value.subtitle ?? 'Pindai untuk mengambil nomor antrean'}</p>
      <img src="${window.location.origin}${qrSrc.value}" onload="window.print()" />
      <div class="url">${qrTarget.value.url}</div>
    </body></html>
  `)
  win.document.close()
}
</script>

<template>
  <div>
    <UiPageHeading
      title="Halaman Publik & QR"
      icon="i-lucide-qr-code"
      description="Halaman yang dibuka pengunjung untuk mengambil nomor antrean. Setiap halaman punya kode publikasi dan QR sendiri."
    >
      <template #actions>
        <UiEventPicker />
        <UButton
          v-if="can(PERMISSIONS.PUBLIC_PAGE_MANAGE)"
          icon="i-lucide-plus"
          label="Halaman Baru"
          :disabled="!currentId"
          @click="createOpen = true"
        />
      </template>
    </UiPageHeading>

    <div v-if="pending && !pages.length" class="grid gap-4 md:grid-cols-2">
      <USkeleton v-for="i in 2" :key="i" class="h-56" />
    </div>

    <div
      v-else-if="!pages.length"
      class="rounded-xl border border-dashed border-slate-300 py-16 text-center dark:border-slate-700"
    >
      <UIcon name="i-lucide-qr-code" class="mx-auto size-10 text-slate-400" />
      <p class="mt-3 font-medium">
        Belum ada halaman publik
      </p>
      <p class="mx-auto mt-1 max-w-md text-sm text-slate-500">
        Buat halaman, susun tampilannya di builder, lalu cetak QR-nya untuk ditempel di lokasi layanan.
      </p>
      <UButton
        v-if="can(PERMISSIONS.PUBLIC_PAGE_MANAGE)"
        class="mt-4"
        icon="i-lucide-plus"
        label="Buat Halaman"
        :disabled="!currentId"
        @click="createOpen = true"
      />
    </div>

    <div v-else class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <article
        v-for="page in pages"
        :key="page.id"
        class="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
      >
        <!-- Cuplikan warna & gambar halaman: daftar jadi bisa dipindai secara visual,
             bukan dibaca satu per satu. -->
        <div
          class="relative h-20 bg-cover bg-center"
          :style="{
            backgroundColor: page.theme?.primaryColor ?? '#1b5cf5',
            ...(page.backgroundUrl ? { backgroundImage: `url(${page.backgroundUrl})` } : {}),
          }"
        >
          <div
            class="absolute inset-0"
            :style="{ backgroundColor: page.theme?.primaryColor ?? '#1b5cf5', opacity: page.backgroundUrl ? 0.7 : 1 }"
          />
          <img
            v-if="page.logoUrl"
            :src="page.logoUrl"
            alt=""
            class="absolute bottom-2 left-4 h-9 w-auto object-contain"
          >
          <UBadge
            class="absolute right-3 top-3"
            variant="solid"
            :color="page.isPublished ? 'success' : 'neutral'"
            :label="page.isPublished ? 'Terbit' : 'Draf'"
          />
        </div>

        <div class="p-4">
          <p class="truncate font-semibold">
            {{ page.title }}
          </p>
          <p class="truncate text-sm text-slate-500">
            {{ page.subtitle || 'Tanpa subjudul' }}
          </p>

          <!--
            Dua alamat: yang atas tercetak di QR dan bisa diganti, yang bawah tetap
            selama slugnya tidak diubah.
          -->
          <div class="mt-3 space-y-1.5">
            <div class="flex items-center gap-2 rounded-lg bg-slate-50 p-2 dark:bg-slate-800/50">
              <UIcon name="i-lucide-qr-code" class="size-4 shrink-0 text-slate-400" />
              <code class="min-w-0 flex-1 truncate text-xs">{{ page.url }}</code>
              <UButton icon="i-lucide-copy" aria-label="Salin tautan kode publikasi" title="Salin tautan kode publikasi" size="xs" variant="ghost" color="neutral" @click="copyUrl(page.url)" />
              <UButton icon="i-lucide-external-link" aria-label="Buka halaman publik" title="Buka halaman publik" size="xs" variant="ghost" color="neutral" :to="page.url" target="_blank" />
            </div>
            <div v-if="page.slugUrl" class="flex items-center gap-2 rounded-lg bg-slate-50 p-2 dark:bg-slate-800/50">
              <UIcon name="i-lucide-link" class="size-4 shrink-0 text-slate-400" />
              <code class="min-w-0 flex-1 truncate text-xs">{{ page.slugUrl }}</code>
              <UButton icon="i-lucide-copy" aria-label="Salin tautan tetap" title="Salin tautan tetap" size="xs" variant="ghost" color="neutral" @click="copyUrl(page.slugUrl)" />
              <UButton icon="i-lucide-external-link" aria-label="Buka tautan tetap" title="Buka tautan tetap" size="xs" variant="ghost" color="neutral" :to="page.slugUrl" target="_blank" />
            </div>
          </div>

          <div class="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
            <span>Kode: <b class="font-mono">{{ page.publishCode }}</b></span>
            <span>QR v{{ page.qrCodes[0]?.version ?? 1 }}</span>
            <span>Maks {{ page.maxPerIpPerDay || '∞' }} / IP / hari</span>
            <span>{{ page.allowedQueueTypeIds?.length ? `${page.allowedQueueTypeIds.length} layanan` : 'Semua layanan' }}</span>
            <!-- Pagar lokasi mengubah siapa yang bisa membuka halaman; itu pantas
                 terlihat di daftar, bukan hanya di dalam builder. -->
            <span v-if="page.geofenceEnabled" class="inline-flex items-center gap-1 font-medium text-amber-600 dark:text-amber-400">
              <UIcon name="i-lucide-map-pin" class="size-3.5" />
              Radius {{ formatDistance(page.geofenceRadiusM) }}
            </span>
          </div>

          <div class="mt-4 flex flex-wrap gap-2">
            <UButton
              v-if="can(PERMISSIONS.PUBLIC_PAGE_MANAGE)"
              size="sm"
              icon="i-lucide-layout-template"
              label="Susun Tampilan"
              :to="`/admin/public-pages/${page.id}`"
            />
            <UButton size="sm" icon="i-lucide-qr-code" variant="outline" color="neutral" label="QR" @click="qrTarget = page" />
            <UiActionButton
              v-if="can(PERMISSIONS.PUBLIC_PAGE_PUBLISH)"
              size="sm"
              :icon="page.isPublished ? 'i-lucide-eye-off' : 'i-lucide-globe'"
              :color="page.isPublished ? 'warning' : 'primary'"
              variant="soft"
              :label="page.isPublished ? 'Hentikan' : 'Publikasikan'"
              :action="() => togglePublish(page)"
            />
            <UDropdownMenu
              v-if="can(PERMISSIONS.PUBLIC_PAGE_MANAGE)"
              :items="[
                [
                  { label: 'Perbarui QR', icon: 'i-lucide-refresh-cw', onSelect: () => regenerateQr(page, false) },
                  { label: 'Ganti tautan & QR', icon: 'i-lucide-shuffle', onSelect: () => regenerateQr(page, true) },
                ],
                [{ label: 'Hapus', icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: () => (deleteTarget = page) }],
              ]"
            >
              <UButton size="sm" icon="i-lucide-ellipsis-vertical" aria-label="Menu tindakan" title="Menu tindakan" variant="ghost" color="neutral" />
            </UDropdownMenu>
          </div>
        </div>
      </article>
    </div>

    <!-- Modal QR -->
    <UModal
      :open="!!qrTarget"
      :title="qrTarget?.title"
      description="Pindai untuk membuka halaman pengambilan antrean."
      @update:open="(v) => { if (!v) qrTarget = null }"
    >
      <template #body>
        <div class="text-center">
          <img
            v-if="qrSrc"
            :src="qrSrc"
            alt="QR Code"
            class="mx-auto size-64 rounded-xl border border-slate-200 bg-white p-2 dark:border-slate-700"
          >
          <code class="mt-3 block break-all text-xs text-slate-500">{{ qrTarget?.url }}</code>

          <div class="mt-4 flex flex-wrap justify-center gap-2">
            <UButton
              size="sm"
              icon="i-lucide-download"
              variant="outline"
              color="neutral"
              label="PNG"
              :to="`/api/admin/public-pages/${qrTarget?.id}/qr?format=png&size=1200&download=true`"
              external
            />
            <UButton
              size="sm"
              icon="i-lucide-download"
              variant="outline"
              color="neutral"
              label="SVG"
              :to="`/api/admin/public-pages/${qrTarget?.id}/qr?format=svg&download=true`"
              external
            />
            <UButton size="sm" icon="i-lucide-printer" variant="outline" color="neutral" label="Cetak" @click="printQr" />
          </div>
        </div>
      </template>
    </UModal>

    <!-- Buat halaman: cukup judulnya, sisanya di builder -->
    <UModal
      v-model:open="createOpen"
      title="Halaman Publik Baru"
      description="Halaman dibuat sebagai draf. Tampilannya disusun di builder setelah ini."
    >
      <template #body>
        <UFormField label="Judul halaman" required>
          <UInput v-model="newTitle" class="w-full" placeholder="Galeri Inovasi AHU" autofocus />
        </UFormField>
      </template>
      <template #footer="{ close }">
        <div class="flex w-full justify-end gap-2">
          <UButton variant="ghost" color="neutral" label="Batal" @click="close" />
          <UButton
            :loading="creating"
            :disabled="newTitle.trim().length < 2"
            icon="i-lucide-layout-template"
            label="Buat & Susun"
            @click="createPage"
          />
        </div>
      </template>
    </UModal>

    <UModal
      :open="!!deleteTarget"
      title="Hapus halaman publik?"
      :description="`&quot;${deleteTarget?.title}&quot; akan dihapus dan tautannya tidak dapat diakses lagi.`"
      @update:open="(v) => { if (!v) deleteTarget = null }"
    >
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton variant="ghost" color="neutral" label="Batal" @click="deleteTarget = null" />
          <UButton color="error" :loading="deleting" label="Hapus" @click="confirmDelete" />
        </div>
      </template>
    </UModal>
  </div>
</template>
