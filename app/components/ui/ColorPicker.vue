<script setup lang="ts">
import type PickrType from '@simonwep/pickr'
import '@simonwep/pickr/dist/themes/nano.min.css'

/**
 * Pemilih warna (Pickr) untuk warna merek, warna layanan, dan gaya widget display.
 *
 * Menggantikan `<input type="color">` bawaan peramban, yang tampilannya berbeda di
 * tiap sistem operasi, tidak bisa diberi warna pilihan cepat, dan di beberapa
 * peramban desktop membuka dialog sistem yang menutupi formulir.
 *
 * Kolom teks di sebelahnya sengaja dipertahankan: nilai warna di sini sering disalin
 * dari panduan identitas instansi ("#004080"), dan mengetik jauh lebih cepat daripada
 * mencari titik yang sama persis di roda warna. Keduanya terikat pada nilai yang sama.
 */
const props = withDefaults(defineProps<{
  modelValue: string
  /** Nama kolom untuk pembaca layar — tombolnya hanya berisi warna, tanpa teks. */
  label?: string
  /** Warna pilihan cepat; defaultnya palet layanan ANTREAN. */
  swatches?: string[]
  disabled?: boolean
  /** Sembunyikan kolom teks bila ruangnya memang sempit. */
  hideInput?: boolean
  /**
   * Izinkan warna tembus pandang, menghasilkan hex 8 digit ("#0f172acc").
   *
   * Hanya untuk nilai yang ditumpuk di atas sesuatu — panel widget di atas gambar
   * latar layar, atau warna latar layar di atas gambar latarnya. Warna merek dan
   * warna layanan tetap 6 digit: nilainya divalidasi sebagai hex 6 digit di server
   * dan dipakai menghitung kontras teks, yang keduanya tidak mengenal alpha.
   */
  alpha?: boolean
}>(), {
  label: 'Warna',
  swatches: () => ['#1b5cf5', '#7c3aed', '#0d9488', '#ea580c', '#dc2626', '#4f46e5', '#059669', '#0891b2', '#0f172a', '#ffffff'],
  disabled: false,
  hideInput: false,
  alpha: false,
})

const emit = defineEmits<{ 'update:modelValue': [string] }>()

const anchor = ref<HTMLElement | null>(null)
let pickr: PickrType | null = null

/**
 * Bentuk yang diterima: hex 6 digit, atau 8 digit bila kolomnya mengizinkan alpha.
 * Bentuk pendek (#abc, #abcd) dan tanpa pagar ikut diterima — pengguna menyalin
 * nilai dari mana saja.
 */
function normalize(value: string): string | null {
  let v = value.trim().replace(/^#/, '').toLowerCase()

  if (/^[0-9a-f]{3}$/.test(v) || (props.alpha && /^[0-9a-f]{4}$/.test(v))) {
    v = v.split('').map(c => c + c).join('')
  }

  if (/^[0-9a-f]{6}$/.test(v)) return '#' + v
  if (props.alpha && /^[0-9a-f]{8}$/.test(v)) {
    // Alpha penuh ditulis 6 digit, sama seperti keluaran Pickr — supaya nilai yang
    // tersimpan tidak berubah bentuk hanya karena kolomnya mengizinkan alpha.
    return '#' + (v.endsWith('ff') ? v.slice(0, 6) : v)
  }
  return null
}

/**
 * Menjaga panel tetap utuh di dalam layar.
 *
 * Pickr menyerahkan penempatan panel ke nanopop dengan acuan `document.body`. Pada
 * halaman yang lebih tinggi daripada layar — panel properti Display Builder, misalnya
 * — acuan itu selalu tampak masih punya ruang di bawah, jadi panelnya tidak pernah
 * dibalik ke atas dan tombol Pakai/Batal jatuh di luar layar. Penggeser tembus pandang
 * menambah tinggi panel, jadi tanpa penyesuaian ini masalahnya makin sering muncul.
 */
function jagaDalamLayar() {
  const app = (pickr?.getRoot() as { app?: HTMLElement } | undefined)?.app
  if (!app || !anchor.value) return

  const JARAK = 8
  const panel = app.getBoundingClientRect()
  const pemicu = anchor.value.getBoundingClientRect()

  if (panel.bottom > window.innerHeight - JARAK) {
    // Dibalik ke atas pemicu bila muat; kalau tidak, digeser naik seperlunya.
    const diAtas = pemicu.top - panel.height - JARAK
    const turun = window.innerHeight - panel.height - JARAK
    app.style.top = `${Math.max(JARAK, diAtas >= JARAK ? diAtas : turun)}px`
  }

  if (panel.right > window.innerWidth - JARAK) {
    app.style.left = `${Math.max(JARAK, window.innerWidth - panel.width - JARAK)}px`
  }
}

/** Teks yang sedang diketik; baru diteruskan ke atas bila sudah berupa warna sah. */
const teks = ref(props.modelValue)

watch(() => props.modelValue, (baru) => {
  if (normalize(teks.value) !== normalize(baru)) teks.value = baru
  const sah = normalize(baru)
  if (sah && pickr && pickr.getColor()?.toHEXA?.().toString(0)?.toLowerCase() !== sah) {
    pickr.setColor(sah, true)
  }
})

function onKetik(nilai: string | number) {
  teks.value = String(nilai)
  const sah = normalize(teks.value)
  if (sah) emit('update:modelValue', sah)
}

/** Saat kolom ditinggalkan, teks yang tidak sah dikembalikan ke nilai terakhir yang benar. */
function onBlur() {
  if (!normalize(teks.value)) teks.value = props.modelValue
}

onMounted(async () => {
  if (!anchor.value) return

  /**
   * Pickr dimuat hanya di peramban.
   *
   * Pustakanya menyentuh `document` saat dievaluasi, jadi impor biasa akan ikut
   * dijalankan saat render server dan menjatuhkan seluruh komponen — tombolnya pun
   * tidak pernah muncul di halaman.
   */
  const { default: Pickr } = await import('@simonwep/pickr')

  pickr = Pickr.create({
    el: anchor.value,
    theme: 'nano',
    default: normalize(props.modelValue) ?? '#1b5cf5',
    swatches: props.swatches,
    useAsButton: true,
    position: 'bottom-start',
    /**
     * Nilai yang disimpan aplikasi ini selalu heksadesimal, jadi panelnya pun
     * menampilkan heksadesimal — bukan HSLA bawaan Pickr yang tidak bisa ditempel
     * balik ke kolom di sebelahnya.
     */
    defaultRepresentation: 'HEXA',
    /** Tanpa perbandingan "warna lama vs baru": kolom teks di sebelahnya sudah menunjukkannya. */
    comparison: false,
    components: {
      preview: true,
      hue: true,
      /**
       * Penggeser tembus pandang hanya muncul di kolom yang memang ditumpuk di atas
       * sesuatu. Di kolom lain ia menyesatkan: nilainya tampak bisa diatur, padahal
       * hex 8 digit ditolak saat disimpan.
       */
      opacity: props.alpha,
      interaction: { input: true, save: true, cancel: true },
    },
    /**
     * Termasuk `btn:toggle`: Pickr MENIMPA `aria-label` tombol pemicu dengan teksnya
     * sendiri ("toggle color picker dialog"), jadi nama yang dibacakan pembaca layar
     * harus diberikan lewat sini — bukan lewat atribut di template.
     */
    i18n: {
      'btn:toggle': props.label,
      'btn:save': 'Pakai',
      'btn:cancel': 'Batal',
      'ui:dialog': `Pemilih ${props.label.toLowerCase()}`,
      'aria:btn:save': 'Pakai warna ini',
      'aria:btn:cancel': 'Batalkan',
      'aria:input': props.alpha
        ? 'Nilai warna heksadesimal, dua digit terakhir tingkat tembus pandang'
        : 'Nilai warna heksadesimal',
      'aria:palette': 'Bidang warna',
      'aria:hue': 'Penggeser rona warna',
      'aria:opacity': 'Penggeser tembus pandang',
    },
  })

  /**
   * `change` dipancarkan terus selama warna digeser, jadi pratinjau di halaman
   * (kartu layanan, papan display) ikut bergerak. Nilainya baru "dikunci" saat
   * ditekan Pakai — tetapi menutup panel pun tidak membatalkan perubahan, sesuai
   * kebiasaan pemilih warna di aplikasi desain.
   */
  pickr.on('change', (warna: { toHEXA: () => { toString: (n?: number) => string } }) => {
    /**
     * Pickr sendiri membuang dua digit alpha saat warnanya pekat, jadi kolom tanpa
     * alpha tetap menghasilkan 6 digit persis seperti sebelumnya — dan kolom yang
     * ber-alpha pun hanya melebar ke 8 digit ketika pengguna benar-benar
     * menggeser tembus pandangnya.
     */
    const hex = warna.toHEXA().toString(0).toLowerCase()
    teks.value = hex
    emit('update:modelValue', hex)
  })

  /**
   * Warna awal ditegaskan setelah panel siap.
   *
   * Opsi `default` saja ternyata tidak cukup: panel sempat terbuka menampilkan hitam
   * padahal nilai tersimpannya biru. Menyetelnya lagi saat `init` membuat apa yang
   * terlihat di panel selalu sama dengan yang tertulis di kolom teks.
   */
  pickr.on('init', () => {
    const awal = normalize(props.modelValue)
    if (awal) pickr?.setColor(awal, true)
  })

  // Penempatan diperbaiki setelah nanopop selesai, satu bingkai sesudah panel tampil.
  pickr.on('show', () => requestAnimationFrame(jagaDalamLayar))

  pickr.on('save', () => pickr?.hide())
  pickr.on('cancel', () => pickr?.hide())
})

onBeforeUnmount(() => {
  pickr?.destroyAndRemove()
  pickr = null
})

watch(() => props.disabled, (mati) => {
  if (mati) pickr?.disable()
  else pickr?.enable()
})
</script>

<template>
  <div class="flex items-center gap-2">
    <!--
      Tombol pemicu digambar sendiri (useAsButton) supaya bentuknya mengikuti
      komponen lain di aplikasi ini, bukan tombol bawaan Pickr.
    -->
    <button
      ref="anchor"
      type="button"
      :disabled="disabled"
      :aria-label="label"
      :title="label"
      class="size-9 shrink-0 overflow-hidden rounded-lg border border-slate-300 shadow-sm transition-transform disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700"
      :class="[{ 'hover:scale-105': !disabled }, alpha ? 'pcr-swatch-alpha' : '']"
    >
      <!--
        Warnanya dilapiskan di atas kotak-kotak: tanpa itu, warna yang setengah
        tembus pandang tampak sekadar lebih muda, dan yang benar-benar bening
        tampak seperti tombol kosong.
      -->
      <span class="block size-full" :style="{ backgroundColor: modelValue }" />
    </button>

    <UInput
      v-if="!hideInput"
      :model-value="teks"
      :disabled="disabled"
      :aria-label="`${label} (kode heksadesimal)`"
      :placeholder="alpha ? '#1b5cf5cc' : '#1b5cf5'"
      class="w-full font-mono"
      size="sm"
      @update:model-value="onKetik"
      @blur="onBlur"
    />
  </div>
</template>
