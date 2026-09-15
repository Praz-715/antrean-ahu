<script setup lang="ts">
import { apiFetch } from '../../composables/useApi'
import { filterValue, SELECT_ALL } from '#shared/constants/ui'
import type { ApiError } from '../../composables/useApi'
import { PERMISSIONS } from '#shared/constants/permissions'

definePageMeta({ layout: 'admin', middleware: 'admin' })
useHead({ title: 'Media Library' })

interface MediaItem {
  id: string
  name: string
  type: 'IMAGE' | 'VIDEO' | 'AUDIO'
  mime: string
  url: string
  sizeBytes: number
  width: number | null
  height: number | null
  durationSeconds: number | null
  createdAt: string
  uploadedBy: { id: string, name: string } | null
}

interface PlaylistItem {
  id: string
  durationSeconds: number
  media: { id: string, name: string, type: string, url: string }
}

interface Playlist {
  id: string
  name: string
  isActive: boolean
  totalSeconds?: number
  items: PlaylistItem[]
}

const { can } = useMe()
const { call } = useApi()
const toast = useToast()

const tab = ref<'media' | 'playlist'>('media')
const media = ref<MediaItem[]>([])
const playlists = ref<Playlist[]>([])
const pending = ref(false)
const search = ref('')
const typeFilter = ref<string>(SELECT_ALL)

async function load() {
  pending.value = true
  try {
    const [list, pl] = await Promise.all([
      apiFetch<MediaItem[]>('/api/admin/media', {
        query: { ...(filterValue(typeFilter.value) ? { type: typeFilter.value } : {}), ...(search.value ? { search: search.value } : {}) },
      }),
      apiFetch<Playlist[]>('/api/admin/playlists'),
    ])
    media.value = list
    playlists.value = pl
  }
  finally { pending.value = false }
}
await load()

let searchTimer: ReturnType<typeof setTimeout>
watch(search, () => { clearTimeout(searchTimer); searchTimer = setTimeout(load, 300) })
watch(typeFilter, load)

// ---- unggah ----
const fileInput = ref<HTMLInputElement | null>(null)
const uploading = ref(false)
const uploadProgress = ref('')
const dragOver = ref(false)

/** Durasi video hanya bisa dibaca di browser; server memakainya untuk lama tayang playlist. */
/**
 * Durasi dibaca di peramban, bukan di server.
 *
 * Membacanya di server berarti memasang ffprobe hanya demi satu angka; elemen
 * `<video>`/`<audio>` sudah tahu durasinya begitu metadata termuat. Nilainya tetap
 * divalidasi ulang di server sebelum disimpan.
 */
function readMediaDuration(file: File): Promise<number | undefined> {
  return new Promise((resolve) => {
    const isVideo = file.type.startsWith('video/')
    const isAudio = file.type.startsWith('audio/')
    if (!isVideo && !isAudio) return resolve(undefined)

    const el = document.createElement(isVideo ? 'video' : 'audio')
    el.preload = 'metadata'
    el.onloadedmetadata = () => {
      URL.revokeObjectURL(el.src)
      resolve(Number.isFinite(el.duration) ? Math.round(el.duration) : undefined)
    }
    el.onerror = () => resolve(undefined)
    el.src = URL.createObjectURL(file)
  })
}

async function uploadFiles(files: FileList | File[]) {
  const list = Array.from(files)
  if (!list.length) return

  uploading.value = true
  let berhasil = 0

  for (const [index, file] of list.entries()) {
    uploadProgress.value = `Mengunggah ${index + 1}/${list.length}: ${file.name}`

    const form = new FormData()
    form.append('file', file)
    form.append('name', file.name.replace(/\.[^.]+$/, ''))
    const duration = await readMediaDuration(file)
    if (duration) form.append('durationSeconds', String(duration))

    try {
      await apiFetch('/api/admin/media', { method: 'POST', body: form })
      berhasil++
    }
    catch (e) {
      toast.add({
        title: `Gagal mengunggah ${file.name}`,
        description: (e as ApiError).message,
        color: 'error',
        icon: 'i-lucide-alert-circle',
      })
    }
  }

  uploading.value = false
  uploadProgress.value = ''
  if (berhasil) {
    toast.add({ title: `${berhasil} berkas diunggah`, color: 'success', icon: 'i-lucide-check-circle' })
    await load()
  }
}

function onDrop(e: DragEvent) {
  dragOver.value = false
  if (e.dataTransfer?.files.length) void uploadFiles(e.dataTransfer.files)
}

function onPick(e: Event) {
  const input = e.target as HTMLInputElement
  if (input.files?.length) void uploadFiles(input.files)
  input.value = ''
}

// ---- aksi media ----
const renameTarget = ref<MediaItem | null>(null)
const renameValue = ref('')

async function saveRename() {
  if (!renameTarget.value) return
  const res = await call(`/api/admin/media/${renameTarget.value.id}`, { method: 'PATCH', body: { name: renameValue.value } }, 'Nama diperbarui')
  renameTarget.value = null
  if (res) await load()
}

const deleteTarget = ref<MediaItem | null>(null)
async function confirmDelete() {
  if (!deleteTarget.value) return
  const res = await call(`/api/admin/media/${deleteTarget.value.id}`, { method: 'DELETE' }, 'Media dihapus')
  deleteTarget.value = null
  if (res) await load()
}

const previewTarget = ref<MediaItem | null>(null)

// ---- playlist ----
const playlistModal = ref(false)
const playlistName = ref('')

async function createPlaylist() {
  const res = await call('/api/admin/playlists', { method: 'POST', body: { name: playlistName.value } }, 'Playlist dibuat')
  if (res) { playlistModal.value = false; playlistName.value = ''; await load() }
}

const editing = ref<Playlist | null>(null)
const draftItems = ref<Array<{ mediaId: string, durationSeconds: number, media: { name: string, type: string, url: string } }>>([])

function openPlaylist(playlist: Playlist) {
  editing.value = playlist
  draftItems.value = playlist.items.map(i => ({
    mediaId: i.media.id,
    durationSeconds: i.durationSeconds,
    media: { name: i.media.name, type: i.media.type, url: i.media.url },
  }))
}

function addToPlaylist(item: MediaItem) {
  draftItems.value.push({
    mediaId: item.id,
    durationSeconds: item.type === 'VIDEO' ? (item.durationSeconds ?? 15) : 10,
    media: { name: item.name, type: item.type, url: item.url },
  })
}

function moveItem(from: number, to: number) {
  if (to < 0 || to >= draftItems.value.length) return
  const [row] = draftItems.value.splice(from, 1)
  draftItems.value.splice(to, 0, row!)
}

async function savePlaylist() {
  if (!editing.value) return
  const res = await call(
    `/api/admin/playlists/${editing.value.id}/items`,
    { method: 'PUT', body: { items: draftItems.value.map(i => ({ mediaId: i.mediaId, durationSeconds: i.durationSeconds })) } },
    'Playlist disimpan',
  )
  if (res) { editing.value = null; await load() }
}

async function deletePlaylist(playlist: Playlist) {
  const res = await call(`/api/admin/playlists/${playlist.id}`, { method: 'DELETE' }, 'Playlist dihapus')
  if (res) { if (editing.value?.id === playlist.id) editing.value = null; await load() }
}

// ---- util tampilan ----
function fileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function durationText(seconds: number | null) {
  if (!seconds) return null
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return m ? `${m}m ${s}s` : `${s}s`
}

const draftTotal = computed(() => draftItems.value.reduce((sum, i) => sum + Number(i.durationSeconds || 0), 0))
</script>

<template>
  <div>
    <UiPageHeading
      title="Media Library"
      icon="i-lucide-image"
      description="Gambar, video, dan audio untuk layar antrean. Format didukung: JPG, PNG, WEBP, MP4, MP3, WAV, OGG, M4A."
    >
      <template #actions>
        <UButton
          v-if="can(PERMISSIONS.MEDIA_MANAGE)"
          icon="i-lucide-upload"
          label="Unggah"
          :loading="uploading"
          @click="fileInput?.click()"
        />
        <input
          ref="fileInput"
          type="file"
          accept="image/jpeg,image/png,image/webp,video/mp4,audio/mpeg,audio/wav,audio/ogg,audio/mp4"
          multiple
          class="hidden"
          @change="onPick"
        >
      </template>
    </UiPageHeading>

    <!-- Tab -->
    <div class="mb-4 flex gap-2">
      <button
        v-for="t in [{ key: 'media', label: 'Media', count: media.length }, { key: 'playlist', label: 'Playlist', count: playlists.length }]"
        :key="t.key"
        type="button"
        class="rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
        :class="tab === t.key
          ? 'bg-brand-600 text-white'
          : 'bg-white text-slate-600 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-800'"
        @click="tab = t.key as 'media' | 'playlist'"
      >
        {{ t.label }} · {{ t.count }}
      </button>
    </div>

    <!-- ================= MEDIA ================= -->
    <template v-if="tab === 'media'">
      <div class="mb-4 flex flex-wrap gap-2">
        <UInput v-model="search" icon="i-lucide-search" placeholder="Cari media…" class="w-56" />
        <USelect
          v-model="typeFilter"
          :items="[
            { label: 'Semua tipe', value: SELECT_ALL },
            { label: 'Gambar', value: 'IMAGE' },
            { label: 'Video', value: 'VIDEO' },
            { label: 'Audio', value: 'AUDIO' },
          ]"
          class="w-40"
        />
      </div>

      <!-- Area seret & lepas -->
      <div
        v-if="can(PERMISSIONS.MEDIA_MANAGE)"
        class="mb-4 rounded-xl border-2 border-dashed p-6 text-center transition-colors"
        :class="dragOver ? 'border-brand-500 bg-brand-50 dark:bg-brand-950/40' : 'border-slate-300 dark:border-slate-700'"
        @dragover.prevent="dragOver = true"
        @dragleave="dragOver = false"
        @drop.prevent="onDrop"
      >
        <UIcon name="i-lucide-upload-cloud" class="mx-auto size-8 text-slate-400" />
        <p class="mt-2 text-sm text-slate-500">
          {{ uploading ? uploadProgress : 'Seret berkas ke sini, atau klik tombol Unggah' }}
        </p>
        <p class="mt-1 text-xs text-slate-400">
          Gambar maks 10 MB · Video maks 200 MB
        </p>
      </div>

      <div v-if="pending && !media.length" class="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <USkeleton v-for="i in 5" :key="i" class="h-40" />
      </div>

      <div v-else-if="!media.length" class="rounded-xl border border-dashed border-slate-300 py-16 text-center dark:border-slate-700">
        <UIcon name="i-lucide-image" class="mx-auto size-10 text-slate-400" />
        <p class="mt-3 font-medium">
          Belum ada media
        </p>
        <p class="mx-auto mt-1 max-w-md text-sm text-slate-500">
          Unggah logo instansi, gambar informasi, video, atau berkas audio (nada panggil) untuk layar antrean.
        </p>
      </div>

      <div v-else class="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <div
          v-for="item in media"
          :key="item.id"
          class="group overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
        >
          <button type="button" class="relative block aspect-video w-full bg-slate-100 dark:bg-slate-800" @click="previewTarget = item">
            <img v-if="item.type === 'IMAGE'" :src="item.url" :alt="item.name" class="size-full object-cover" loading="lazy">
            <div v-else class="flex size-full items-center justify-center">
              <UIcon
                :name="item.type === 'AUDIO' ? 'i-lucide-music' : 'i-lucide-play-circle'"
                class="size-10 text-slate-400"
              />
            </div>
            <span class="absolute left-2 top-2 rounded bg-slate-900/70 px-1.5 py-0.5 text-[10px] font-medium text-white">
              {{ item.type === 'VIDEO' ? 'VIDEO' : item.type === 'AUDIO' ? 'AUDIO' : 'GAMBAR' }}
            </span>
          </button>

          <div class="p-3">
            <p class="truncate text-sm font-medium" :title="item.name">
              {{ item.name }}
            </p>
            <p class="mt-0.5 text-xs text-slate-400">
              {{ fileSize(item.sizeBytes) }}
              <template v-if="item.width">
                · {{ item.width }}×{{ item.height }}
              </template>
              <template v-if="durationText(item.durationSeconds)">
                · {{ durationText(item.durationSeconds) }}
              </template>
            </p>

            <div class="mt-2 flex gap-1">
              <UButton
                v-if="editing"
                size="xs"
                variant="soft"
                icon="i-lucide-plus"
                label="Playlist"
                @click="addToPlaylist(item)"
              />
              <UDropdownMenu
                v-if="can(PERMISSIONS.MEDIA_MANAGE)"
                :items="[
                  [
                    { label: 'Pratinjau', icon: 'i-lucide-eye', onSelect: () => (previewTarget = item) },
                    { label: 'Ubah nama', icon: 'i-lucide-pencil', onSelect: () => { renameTarget = item; renameValue = item.name } },
                  ],
                  [{ label: 'Hapus', icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: () => (deleteTarget = item) }],
                ]"
              >
                <UButton icon="i-lucide-ellipsis-vertical" aria-label="Menu tindakan" title="Menu tindakan" variant="ghost" color="neutral" size="xs" class="ml-auto" />
              </UDropdownMenu>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- ================= PLAYLIST ================= -->
    <template v-else>
      <div class="mb-4">
        <UButton
          v-if="can(PERMISSIONS.MEDIA_MANAGE)"
          icon="i-lucide-plus"
          label="Playlist Baru"
          @click="playlistModal = true"
        />
      </div>

      <div v-if="!playlists.length" class="rounded-xl border border-dashed border-slate-300 py-16 text-center dark:border-slate-700">
        <UIcon name="i-lucide-gallery-horizontal" class="mx-auto size-10 text-slate-400" />
        <p class="mt-3 font-medium">
          Belum ada playlist
        </p>
        <p class="mx-auto mt-1 max-w-md text-sm text-slate-500">
          Playlist memutar gambar dan video bergantian pada satu widget display.
        </p>
      </div>

      <div v-else class="grid gap-4 lg:grid-cols-2">
        <div
          v-for="playlist in playlists"
          :key="playlist.id"
          class="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
          :class="{ 'ring-2 ring-brand-500': editing?.id === playlist.id }"
        >
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <p class="truncate font-semibold">
                {{ playlist.name }}
              </p>
              <p class="text-xs text-slate-500">
                {{ playlist.items.length }} item · total {{ durationText(playlist.totalSeconds ?? 0) ?? '0s' }}
              </p>
            </div>
            <div class="flex gap-1">
              <UButton
                v-if="can(PERMISSIONS.MEDIA_MANAGE)"
                size="xs"
                variant="soft"
                icon="i-lucide-pencil"
                :label="editing?.id === playlist.id ? 'Sedang diubah' : 'Susun'"
                @click="openPlaylist(playlist)"
              />
              <UiActionButton
                v-if="can(PERMISSIONS.MEDIA_MANAGE)"
                size="xs"
                variant="ghost"
                color="error"
                icon="i-lucide-trash-2"
                :action="() => deletePlaylist(playlist)"
              />
            </div>
          </div>

          <div v-if="playlist.items.length" class="mt-3 flex gap-2 overflow-x-auto">
            <div
              v-for="item in playlist.items"
              :key="item.id"
              class="relative size-16 shrink-0 overflow-hidden rounded-lg bg-slate-100 dark:bg-slate-800"
            >
              <img v-if="item.media.type === 'IMAGE'" :src="item.media.url" alt="" class="size-full object-cover">
              <div v-else class="flex size-full items-center justify-center">
                <UIcon name="i-lucide-play" class="size-5 text-slate-400" />
              </div>
              <span class="absolute bottom-0 right-0 bg-slate-900/70 px-1 text-[10px] text-white">
                {{ item.durationSeconds }}s
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- Penyusun playlist -->
      <div v-if="editing" class="mt-6 rounded-xl border border-brand-300 bg-white p-4 dark:border-brand-800 dark:bg-slate-900">
        <div class="mb-3 flex items-center justify-between">
          <div>
            <h2 class="font-semibold">
              Susun: {{ editing.name }}
            </h2>
            <p class="text-xs text-slate-500">
              Buka tab Media untuk menambah item · total {{ draftTotal }} detik
            </p>
          </div>
          <div class="flex gap-2">
            <UButton size="sm" variant="ghost" color="neutral" label="Tutup" @click="editing = null" />
            <UiActionButton size="sm" icon="i-lucide-save" label="Simpan" :action="savePlaylist" />
          </div>
        </div>

        <div v-if="!draftItems.length" class="rounded-lg border border-dashed border-slate-300 py-8 text-center text-sm text-slate-500 dark:border-slate-700">
          Belum ada item. Pindah ke tab <b>Media</b>, lalu tekan tombol "Playlist" pada berkas yang ingin ditambahkan.
        </div>

        <ul v-else class="space-y-2">
          <li
            v-for="(item, index) in draftItems"
            :key="index"
            class="flex items-center gap-3 rounded-lg border border-slate-200 p-2 dark:border-slate-800"
          >
            <span class="w-6 text-center text-xs text-slate-400">{{ index + 1 }}</span>
            <div class="size-12 shrink-0 overflow-hidden rounded bg-slate-100 dark:bg-slate-800">
              <img v-if="item.media.type === 'IMAGE'" :src="item.media.url" alt="" class="size-full object-cover">
              <div v-else class="flex size-full items-center justify-center">
                <UIcon name="i-lucide-play" class="size-4 text-slate-400" />
              </div>
            </div>
            <span class="min-w-0 flex-1 truncate text-sm">{{ item.media.name }}</span>
            <UInputNumber v-model="item.durationSeconds" :min="1" :max="3600" class="w-28" size="sm" />
            <span class="text-xs text-slate-400">detik</span>
            <UButton icon="i-lucide-chevron-up" aria-label="Naikkan urutan" title="Naikkan urutan" size="xs" variant="ghost" color="neutral" @click="moveItem(index, index - 1)" />
            <UButton icon="i-lucide-chevron-down" aria-label="Turunkan urutan" title="Turunkan urutan" size="xs" variant="ghost" color="neutral" @click="moveItem(index, index + 1)" />
            <UButton icon="i-lucide-x" aria-label="Keluarkan dari playlist" title="Keluarkan dari playlist" size="xs" variant="ghost" color="error" @click="draftItems.splice(index, 1)" />
          </li>
        </ul>
      </div>
    </template>

    <!-- Pratinjau -->
    <UModal
      :open="!!previewTarget"
      :title="previewTarget?.name"
      :ui="{ content: 'sm:max-w-3xl' }"
      @update:open="(v) => { if (!v) previewTarget = null }"
    >
      <template #body>
        <img v-if="previewTarget?.type === 'IMAGE'" :src="previewTarget.url" :alt="previewTarget.name" class="w-full rounded-lg">
        <!-- Audio tidak di-autoplay: yang membuka pratinjau belum tentu ingin bunyi -->
        <div v-else-if="previewTarget?.type === 'AUDIO'" class="rounded-lg bg-slate-100 p-6 dark:bg-slate-800">
          <UIcon name="i-lucide-music" class="mx-auto size-10 text-slate-400" />
          <audio :src="previewTarget.url" class="mt-4 w-full" controls preload="metadata" />
        </div>
        <video v-else-if="previewTarget" :src="previewTarget.url" class="w-full rounded-lg" controls autoplay muted />
        <p class="mt-3 text-xs text-slate-500">
          {{ previewTarget?.mime }} · {{ previewTarget ? fileSize(previewTarget.sizeBytes) : '' }}
          <template v-if="previewTarget?.uploadedBy">
            · diunggah {{ previewTarget.uploadedBy.name }}
          </template>
        </p>
      </template>
    </UModal>

    <!-- Ubah nama -->
    <UModal
      :open="!!renameTarget"
      title="Ubah nama media"
      @update:open="(v) => { if (!v) renameTarget = null }"
    >
      <template #body>
        <UFormField label="Nama" required>
          <UInput v-model="renameValue" class="w-full" />
        </UFormField>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton variant="ghost" color="neutral" label="Batal" @click="renameTarget = null" />
          <UiActionButton icon="i-lucide-save" label="Simpan" :action="saveRename" />
        </div>
      </template>
    </UModal>

    <!-- Hapus -->
    <UModal
      :open="!!deleteTarget"
      title="Hapus media?"
      :description="`&quot;${deleteTarget?.name}&quot; akan dihapus permanen beserta berkasnya.`"
      @update:open="(v) => { if (!v) deleteTarget = null }"
    >
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton variant="ghost" color="neutral" label="Batal" @click="deleteTarget = null" />
          <UiActionButton color="error" icon="i-lucide-trash-2" label="Hapus" :action="confirmDelete" />
        </div>
      </template>
    </UModal>

    <!-- Playlist baru -->
    <UModal v-model:open="playlistModal" title="Playlist Baru" description="Kumpulan gambar & video yang diputar bergantian.">
      <template #body>
        <UFormField label="Nama Playlist" required>
          <UInput v-model="playlistName" class="w-full" placeholder="Informasi Lobby" />
        </UFormField>
      </template>
      <template #footer="{ close }">
        <div class="flex w-full justify-end gap-2">
          <UButton variant="ghost" color="neutral" label="Batal" @click="close" />
          <UiActionButton :disabled="playlistName.trim().length < 2" label="Buat" :action="createPlaylist" />
        </div>
      </template>
    </UModal>
  </div>
</template>
