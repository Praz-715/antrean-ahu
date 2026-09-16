<script setup lang="ts">
import { SELECT_NONE } from '#shared/constants/ui'
import { MAX_SUBSET_QUEUE_TYPES } from '#shared/constants/display'

/**
 * Pilih beberapa jenis antrean sekaligus, lalu tentukan urutannya.
 *
 * Urutan disimpan sebagai urutan larik `modelValue` — bukan kolom nomor urut —
 * jadi apa yang terlihat di daftar ini persis apa yang tersimpan.
 *
 * Diurutkan dengan tombol naik/turun, bukan geser-tarik. Layar antrean disetel
 * dari panel admin yang juga dipakai lewat papan ketik, dan geser-tarik tidak
 * punya padanan papan ketik tanpa menulis penanganan fokus sendiri. Tombol sudah
 * bisa dijangkau Tab dan diumumkan pembaca layar apa adanya.
 */
const props = defineProps<{
  modelValue: string[]
  options: Array<{ id: string, code: string, name: string }>
}>()

const emit = defineEmits<{ 'update:modelValue': [string[]] }>()

const label = (id: string) => {
  const t = props.options.find(o => o.id === id)
  return t ? `${t.code} · ${t.name}` : id
}

/** Layanan yang dipilih tapi sudah dihapus dari event tetap ditampilkan apa adanya. */
const terpilih = computed(() => props.modelValue)

const belumDipilih = computed(() =>
  props.options.filter(o => !props.modelValue.includes(o.id)),
)

const penuh = computed(() => props.modelValue.length >= MAX_SUBSET_QUEUE_TYPES)

function tambah(id: string) {
  if (id === SELECT_NONE || props.modelValue.includes(id) || penuh.value) return
  emit('update:modelValue', [...props.modelValue, id])
}

function buang(id: string) {
  emit('update:modelValue', props.modelValue.filter(v => v !== id))
}

/** `arah` -1 naik, +1 turun. Di ujung daftar tidak melakukan apa-apa. */
function pindah(index: number, arah: -1 | 1) {
  const tujuan = index + arah
  if (tujuan < 0 || tujuan >= props.modelValue.length) return
  const salinan = [...props.modelValue]
  const [item] = salinan.splice(index, 1)
  salinan.splice(tujuan, 0, item!)
  emit('update:modelValue', salinan)
}
</script>

<template>
  <div class="space-y-2">
    <p v-if="!terpilih.length" class="rounded-lg border border-dashed border-slate-300 px-3 py-4 text-center text-sm text-slate-500 dark:border-slate-700">
      Belum ada layanan dipilih.
    </p>

    <ol v-else class="space-y-1.5">
      <li
        v-for="(id, i) in terpilih"
        :key="id"
        class="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 py-1.5 pl-2 pr-1.5 dark:border-slate-800 dark:bg-slate-800/50"
      >
        <!-- Nomor urut ditulis, bukan hanya tersirat dari posisi: inilah nilai yang disimpan. -->
        <span class="w-5 shrink-0 text-center text-xs font-semibold tabular-nums text-slate-500">
          {{ i + 1 }}
        </span>
        <span class="min-w-0 flex-1 truncate text-sm">{{ label(id) }}</span>

        <UButton
          icon="i-lucide-chevron-up"
          size="xs"
          variant="ghost"
          color="neutral"
          :disabled="i === 0"
          :aria-label="`Naikkan ${label(id)}`"
          :title="`Naikkan ${label(id)}`"
          @click="pindah(i, -1)"
        />
        <UButton
          icon="i-lucide-chevron-down"
          size="xs"
          variant="ghost"
          color="neutral"
          :disabled="i === terpilih.length - 1"
          :aria-label="`Turunkan ${label(id)}`"
          :title="`Turunkan ${label(id)}`"
          @click="pindah(i, 1)"
        />
        <UButton
          icon="i-lucide-x"
          size="xs"
          variant="ghost"
          color="error"
          :aria-label="`Keluarkan ${label(id)}`"
          :title="`Keluarkan ${label(id)}`"
          @click="buang(id)"
        />
      </li>
    </ol>

    <!--
      Pemilihnya selalu kembali ke nilai kosong setelah dipakai: ia menambah ke
      daftar di atas, bukan menyimpan satu pilihan. Nilai yang tertinggal di kolom
      akan terbaca seolah-olah layanan itu belum masuk daftar padahal sudah.
    -->
    <USelect
      v-if="belumDipilih.length && !penuh"
      :model-value="SELECT_NONE"
      :items="[
        { label: 'Tambah layanan…', value: SELECT_NONE },
        ...belumDipilih.map(t => ({ label: `${t.code} · ${t.name}`, value: t.id })),
      ]"
      size="sm"
      class="w-full"
      aria-label="Tambah jenis antrean ke daftar"
      @update:model-value="(v) => tambah(v as string)"
    />
    <p v-else-if="penuh" class="text-xs text-slate-500">
      Maksimal {{ MAX_SUBSET_QUEUE_TYPES }} layanan pada satu layar.
    </p>
  </div>
</template>
