<script setup lang="ts">
import type { PublicFormFieldDef, PublicServiceView, PublicTicketView } from '#shared/types/public-page'
import { withAlpha } from '#shared/utils/color'

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
}>()

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

/** Pengunjung yang sudah punya nomor melihat nomornya dulu, bukan formulir kosong. */
const mode = ref<'ticket' | 'form'>('form')
watch(() => [open.value, props.ticket] as const, ([terbuka]) => {
  if (terbuka) mode.value = props.ticket ? 'ticket' : 'form'
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

defineExpose({
  /** Dipanggil induk sebelum mengirim; mengembalikan tiket captcha geser. */
  mintaSlider: () => sliderRef.value?.minta() ?? Promise.resolve(null),
  resetTurnstile: () => turnstileRef.value?.reset(),
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
      <div v-if="service" class="space-y-5">
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
            :label="field.label"
            :required="field.isRequired"
            :help="field.helpText ?? undefined"
            :error="fieldErrors[field.key]?.[0]"
          >
            <UTextarea
              v-if="field.type === 'TEXTAREA'"
              v-model="values[field.key] as string"
              :placeholder="field.placeholder ?? ''"
              :rows="3"
              size="lg"
              class="w-full"
            />
            <USelect
              v-else-if="field.type === 'SELECT'"
              v-model="values[field.key] as string"
              :items="optionsOf(field)"
              :placeholder="field.placeholder ?? 'Pilih…'"
              size="lg"
              class="w-full"
            />
            <URadioGroup
              v-else-if="field.type === 'RADIO'"
              v-model="values[field.key] as string"
              :items="optionsOf(field)"
            />
            <UCheckboxGroup
              v-else-if="field.type === 'CHECKBOX'"
              v-model="values[field.key] as string[]"
              :items="optionsOf(field)"
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
