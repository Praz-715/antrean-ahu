/**
 * Katalog pengaturan sistem (§49).
 *
 * Satu katalog dipakai tiga pihak sekaligus: server memvalidasi dan mengisi nilai
 * bawaan darinya, halaman admin merender formulirnya secara generik, dan kode fitur
 * membaca nilainya lewat kunci yang sama. Menambah pengaturan baru cukup satu entri
 * di sini — tidak ada lagi daftar kunci yang tercecer di tiga tempat lalu berbeda.
 */

export const SETTING_KEYS = {
  QUEUE_NUMBER_LENGTH: 'queue.numberLength',
  QUEUE_DEFAULT_PREFIX: 'queue.defaultPrefix',
  QUEUE_AUTO_CLOSE: 'queue.autoClose',
  QUEUE_AUTO_RESET: 'queue.autoReset',
  QUEUE_RECALL_LIMIT: 'queue.recallLimit',
  QUEUE_MAX_WAITING: 'queue.maxWaiting',
  QUEUE_PUBLIC_REGISTRATION: 'queue.publicRegistration',
  FEEDBACK_RATING_ENABLED: 'feedback.ratingEnabled',
  FEEDBACK_AUTO_APPROVE: 'feedback.autoApprove',
  DISPLAY_VOICE_ENABLED: 'display.voiceEnabled',
  DISPLAY_VOICE_LANGUAGE: 'display.voiceLanguage',
  DISPLAY_VOICE_PROVIDER: 'display.voiceProvider',
  DISPLAY_VOICE_EXTERNAL_URL: 'display.voiceExternalUrl',
  DISPLAY_VOICE_CHIME_MEDIA_ID: 'display.voiceChimeMediaId',
  DISPLAY_TIMEOUT_SECONDS: 'display.timeoutSeconds',
  SYSTEM_TIMEZONE: 'system.timezone',
  SYSTEM_SESSION_MINUTES: 'system.sessionDurationMinutes',
  SYSTEM_LANDING: 'system.landing',
} as const

export type SettingKey = (typeof SETTING_KEYS)[keyof typeof SETTING_KEYS]

/**
 * Halaman yang dibuka pengunjung saat mengakses alamat pangkal (`/`).
 *
 * Nilainya satu string supaya cukup satu pilihan di antarmuka: `none`,
 * `directory`, atau `event:<id>`. Menyimpannya sebagai dua pengaturan terpisah
 * (mode + id event) hanya menghasilkan keadaan yang mustahil — mode `none` dengan
 * id event tersisa — yang harus dijaga di setiap pembacanya.
 */
export const LANDING_NONE = 'none'
export const LANDING_DIRECTORY = 'directory'
export const LANDING_EVENT_PREFIX = 'event:'

export type LandingMode = 'none' | 'directory' | 'event'

export function parseLanding(raw: unknown): { mode: LandingMode, eventId: string | null } {
  const value = String(raw ?? LANDING_NONE).trim()
  if (value === LANDING_DIRECTORY) return { mode: 'directory', eventId: null }
  if (value.startsWith(LANDING_EVENT_PREFIX)) {
    const id = value.slice(LANDING_EVENT_PREFIX.length)
    return /^[0-9A-HJKMNP-TV-Z]{26}$/i.test(id) ? { mode: 'event', eventId: id } : { mode: 'none', eventId: null }
  }
  return { mode: 'none', eventId: null }
}

/**
 * Sumber suara panggilan di layar antrean.
 *
 * Satu daftar untuk dua pemakai: katalog pengaturan di berkas ini DAN penimpa
 * per-event di `shared/schemas/event.ts`. Sebelumnya keduanya menulis daftarnya
 * sendiri, dan menambah satu sumber baru hanya di salah satunya membuat penimpaan
 * per-event ditolak tanpa pesan yang jelas.
 */
export const VOICE_PROVIDERS = ['browser', 'gtranslate', 'external', 'chime'] as const
export type VoiceProvider = (typeof VOICE_PROVIDERS)[number]

/** Label untuk ketiga tempat yang menawarkannya: katalog, halaman event, dan builder. */
export const VOICE_PROVIDER_OPTIONS: Array<{ label: string, value: VoiceProvider }> = [
  { label: 'Suara peramban (bawaan)', value: 'browser' },
  { label: 'Google Translate (gratis, butuh internet)', value: 'gtranslate' },
  { label: 'TTS eksternal', value: 'external' },
  { label: 'Hanya nada panggil (tanpa suara bicara)', value: 'chime' },
]

/** Nada bawaan sistem memakai awalan ini; sisanya dianggap id berkas Media Library. */
export const SYSTEM_TONE_VALUE_PREFIX = 'system:'

export type SettingValue = boolean | number | string

export interface SettingDefinition {
  key: SettingKey
  label: string
  help: string
  group: SettingGroupKey
  /**
   * `media` = pilih berkas dari Media Library; nilainya disimpan sebagai id media.
   * Pilihannya tidak bisa ditulis di katalog karena isinya berubah-ubah.
   */
  /**
   * `landing` = tujuan halaman pangkal. Seperti `media`, pilihannya tidak bisa
   * ditulis di katalog karena bergantung pada event yang ada dan sudah terbit.
   */
  type: 'boolean' | 'number' | 'text' | 'select' | 'media' | 'landing'
  default: SettingValue
  min?: number
  max?: number
  maxLength?: number
  unit?: string
  options?: Array<{ label: string, value: string }>
  /** Nilai ini juga bisa ditimpa per-event lewat `events.settings`. */
  eventOverride?: string
  /** Untuk `type: 'media'` — jenis berkas yang boleh dipilih. */
  mediaType?: 'IMAGE' | 'VIDEO' | 'AUDIO'
  /** Kolom hanya tampil bila kunci lain bernilai tertentu. */
  showWhen?: { key: SettingKey, equals: SettingValue }
}

export type SettingGroupKey = 'queue' | 'feedback' | 'display' | 'system'

export const SETTING_GROUPS: Array<{ key: SettingGroupKey, label: string, icon: string, description: string }> = [
  {
    key: 'queue',
    label: 'Antrean',
    icon: 'i-lucide-ticket',
    description: 'Nilai bawaan penomoran dan aturan yang berlaku untuk seluruh event.',
  },
  {
    key: 'feedback',
    label: 'Rating & Testimoni',
    icon: 'i-lucide-star',
    description: 'Penilaian yang diminta ke pengunjung setelah selesai dilayani.',
  },
  {
    key: 'display',
    label: 'Display & Suara',
    icon: 'i-lucide-monitor-speaker',
    description: 'Perilaku bawaan layar antrean dan pengumuman suara.',
  },
  {
    key: 'system',
    label: 'Sistem',
    icon: 'i-lucide-server-cog',
    description: 'Zona waktu dan keamanan sesi.',
  },
]

export const TIMEZONE_OPTIONS = [
  { label: 'WIB — Asia/Jakarta', value: 'Asia/Jakarta' },
  { label: 'WITA — Asia/Makassar', value: 'Asia/Makassar' },
  { label: 'WIT — Asia/Jayapura', value: 'Asia/Jayapura' },
]

export const SETTINGS_CATALOG: SettingDefinition[] = [
  {
    key: SETTING_KEYS.QUEUE_NUMBER_LENGTH,
    label: 'Panjang nomor antrean',
    help: 'Jumlah digit setelah prefix. 3 menghasilkan A001, 4 menghasilkan A0001.',
    group: 'queue',
    type: 'number',
    default: 3,
    min: 1,
    max: 6,
    unit: 'digit',
  },
  {
    key: SETTING_KEYS.QUEUE_DEFAULT_PREFIX,
    label: 'Prefix bawaan',
    help: 'Dipakai saat jenis antrean baru dibuat dan prefix belum diisi.',
    group: 'queue',
    type: 'text',
    default: 'A',
    maxLength: 10,
  },
  {
    key: SETTING_KEYS.QUEUE_AUTO_CLOSE,
    label: 'Tutup otomatis di luar jam layanan',
    help: 'Event OPEN berhenti menerima antrean baru begitu melewati jam tutup pada jadwalnya.',
    group: 'queue',
    type: 'boolean',
    default: true,
  },
  {
    key: SETTING_KEYS.QUEUE_AUTO_RESET,
    label: 'Reset nomor tiap hari',
    help: 'Nomor kembali ke urutan awal pada tanggal layanan berikutnya.',
    group: 'queue',
    type: 'boolean',
    default: true,
  },
  {
    key: SETTING_KEYS.QUEUE_RECALL_LIMIT,
    label: 'Batas panggil ulang',
    help: '0 berarti tanpa batas. Bisa ditimpa per event.',
    group: 'queue',
    type: 'number',
    default: 3,
    min: 0,
    max: 20,
    unit: 'kali',
    eventOverride: 'recallLimit',
  },
  {
    key: SETTING_KEYS.QUEUE_MAX_WAITING,
    label: 'Maksimum antrean menunggu',
    help: '0 berarti tanpa batas. Kuota per jenis antrean tetap didahulukan bila diisi.',
    group: 'queue',
    type: 'number',
    default: 0,
    min: 0,
    max: 100000,
    unit: 'antrean',
    eventOverride: 'maxWaitingPerType',
  },
  {
    key: SETTING_KEYS.QUEUE_PUBLIC_REGISTRATION,
    label: 'Pendaftaran mandiri pengunjung',
    help: 'Bila dimatikan, halaman publik hanya menampilkan informasi — pengambilan nomor ditolak.',
    group: 'queue',
    type: 'boolean',
    default: true,
  },
  {
    key: SETTING_KEYS.FEEDBACK_RATING_ENABLED,
    label: 'Minta rating setelah dilayani',
    help: 'Form penilaian muncul di halaman pelacakan pengunjung saat antrean selesai.',
    group: 'feedback',
    type: 'boolean',
    default: true,
    eventOverride: 'ratingEnabled',
  },
  {
    key: SETTING_KEYS.FEEDBACK_AUTO_APPROVE,
    label: 'Setujui testimoni otomatis',
    help: 'Bila dimatikan, testimoni baru berstatus menunggu moderasi sebelum bisa ditampilkan.',
    group: 'feedback',
    type: 'boolean',
    default: false,
  },
  {
    key: SETTING_KEYS.DISPLAY_VOICE_ENABLED,
    label: 'Panggilan suara di display',
    help: 'Layar membacakan nomor yang dipanggil memakai suara peramban.',
    group: 'display',
    type: 'boolean',
    default: true,
    eventOverride: 'voiceEnabled',
  },
  {
    key: SETTING_KEYS.DISPLAY_VOICE_LANGUAGE,
    label: 'Bahasa suara',
    help: 'Dipakai untuk memilih suara yang tersedia di perangkat display.',
    group: 'display',
    type: 'select',
    default: 'id-ID',
    options: [
      { label: 'Indonesia', value: 'id-ID' },
      { label: 'English (US)', value: 'en-US' },
    ],
    eventOverride: 'voiceLanguage',
  },
  {
    key: SETTING_KEYS.DISPLAY_VOICE_PROVIDER,
    label: 'Sumber suara',
    help: 'Suara peramban memakai suara yang terpasang di perangkat layar (tidak perlu internet, tetapi kualitasnya beda-beda per perangkat). Google Translate menyeragamkan suara semua layar tanpa kunci API, asalkan ada internet. TTS eksternal untuk layanan berbayar milik sendiri. "Hanya nada panggil" tidak membacakan nomor sama sekali — cukup bunyi dari Media Library.',
    group: 'display',
    type: 'select',
    default: 'browser',
    options: VOICE_PROVIDER_OPTIONS,
    eventOverride: 'voiceProvider',
  },
  {
    key: SETTING_KEYS.DISPLAY_VOICE_EXTERNAL_URL,
    label: 'URL TTS eksternal',
    help: 'Alamat layanan TTS yang mengembalikan berkas audio. Gunakan {text} untuk kalimat dan {lang} untuk bahasa, mis. https://tts.instansi.go.id/say?lang={lang}&q={text}. Layar TIDAK memanggil alamat ini langsung — permintaannya lewat server, jadi kunci API di dalam URL tidak ikut terlihat di perangkat.',
    group: 'display',
    type: 'text',
    default: '',
    maxLength: 500,
    showWhen: { key: 'display.voiceProvider', equals: 'external' },
  },
  {
    key: SETTING_KEYS.DISPLAY_VOICE_CHIME_MEDIA_ID,
    label: 'Nada panggil',
    help: 'Nada bawaan sistem atau berkas dari Media Library, dibunyikan sebelum nomor dibacakan — atau sebagai satu-satunya bunyi, bila sumber suaranya "Hanya nada panggil".',
    group: 'display',
    type: 'media',
    mediaType: 'AUDIO',
    default: '',
    eventOverride: 'voiceChimeMediaId',
  },
  {
    key: SETTING_KEYS.DISPLAY_TIMEOUT_SECONDS,
    label: 'Ambang display dianggap offline',
    help: 'Layar yang tidak mengirim kabar selama durasi ini ditandai OFFLINE di daftar perangkat.',
    group: 'display',
    type: 'number',
    default: 60,
    min: 10,
    max: 600,
    unit: 'detik',
  },
  {
    key: SETTING_KEYS.SYSTEM_TIMEZONE,
    label: 'Zona waktu bawaan',
    help: 'Dipakai untuk event baru. Tanggal layanan tiap event tetap mengikuti zona waktunya sendiri.',
    group: 'system',
    type: 'select',
    default: 'Asia/Jakarta',
    options: TIMEZONE_OPTIONS,
  },
  {
    key: SETTING_KEYS.SYSTEM_SESSION_MINUTES,
    label: 'Durasi sesi login',
    help: 'Sesi yang lebih tua dari durasi ini ditolak walau cookie-nya masih ada.',
    group: 'system',
    type: 'number',
    default: 10080,
    min: 15,
    max: 43200,
    unit: 'menit',
  },
  {
    key: SETTING_KEYS.SYSTEM_LANDING,
    label: 'Halaman pangkal (/)',
    help: 'Yang dilihat pengunjung saat membuka alamat utama tanpa tautan atau QR — halaman sambutan, daftar semua halaman publik, atau langsung satu event.',
    group: 'system',
    type: 'landing',
    default: LANDING_NONE,
  },
]

export const SETTINGS_BY_KEY: Record<string, SettingDefinition> = Object.fromEntries(
  SETTINGS_CATALOG.map(def => [def.key, def]),
)

export type SettingsMap = Record<SettingKey, SettingValue>

export const DEFAULT_SETTINGS = Object.fromEntries(
  SETTINGS_CATALOG.map(def => [def.key, def.default]),
) as SettingsMap

/**
 * Paksa nilai apa pun menjadi bentuk yang sesuai definisinya.
 *
 * Nilai tersimpan berasal dari kolom JSON, jadi tipe aslinya bisa saja bergeser
 * setelah definisi berubah (mis. teks menjadi angka). Mengembalikan nilai bawaan
 * lebih baik daripada meloloskan `"true"` sebagai boolean ke dalam logika fitur.
 */
export function coerceSetting(def: SettingDefinition, raw: unknown): SettingValue {
  if (raw === null || raw === undefined) return def.default

  switch (def.type) {
    case 'boolean':
      return typeof raw === 'boolean' ? raw : raw === 'true' || raw === 1
    case 'number': {
      const n = typeof raw === 'number' ? raw : Number(raw)
      if (!Number.isFinite(n)) return def.default
      const clamped = Math.min(def.max ?? Number.MAX_SAFE_INTEGER, Math.max(def.min ?? 0, Math.round(n)))
      return clamped
    }
    case 'select': {
      const s = String(raw)
      return def.options?.some(o => o.value === s) ? s : def.default
    }
    case 'text':
      return String(raw).slice(0, def.maxLength ?? 190)
    /**
     * Dua bentuk yang sah: nada bawaan sistem (`system:tone3`) atau id berkas Media
     * Library (ULID 26 karakter). Keduanya hanya diperiksa BENTUKNYA di sini; apakah
     * berkasnya benar-benar ada diperiksa saat layar meminta state-nya, karena berkas
     * bisa dihapus jauh setelah dipilih.
     */
    case 'media': {
      const id = String(raw).trim()
      if (id.startsWith(SYSTEM_TONE_VALUE_PREFIX)) {
        return /^system:[a-z0-9-]{1,40}$/i.test(id) ? id : ''
      }
      return /^[0-9A-HJKMNP-TV-Z]{26}$/i.test(id) ? id : ''
    }
    /**
     * Bentuknya diperiksa di sini, keberadaan event-nya tidak: event bisa dihapus
     * jauh setelah dipilih, dan halaman pangkal menanganinya sendiri dengan kembali
     * ke halaman sambutan — bukan dengan mengunci pengaturan.
     */
    case 'landing': {
      const value = String(raw).trim()
      if (value === LANDING_DIRECTORY) return value
      if (value.startsWith(LANDING_EVENT_PREFIX)) {
        return parseLanding(value).mode === 'event' ? value : LANDING_NONE
      }
      return LANDING_NONE
    }
  }
}
