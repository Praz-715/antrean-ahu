/**
 * Pengumuman suara memakai Web Speech API bawaan browser (§22).
 * Tidak ada berkas audio per nomor: teks dirangkai lalu diucapkan.
 */
export interface SpeechSettings {
  enabled: boolean
  language: string
  rate: number
  pitch: number
  volume: number
  repeat: number
  voiceName?: string
}

export const DEFAULT_SPEECH: SpeechSettings = {
  enabled: true,
  language: 'id-ID',
  rate: 0.9,
  pitch: 1,
  volume: 1,
  repeat: 2,
}

/** "A023" → "A 0 2 3" supaya terdengar jelas, bukan dibaca "dua puluh tiga". */
export function spellQueueNumber(queueNumber: string): string {
  return queueNumber
    .split('')
    .map(ch => (/[0-9]/.test(ch) ? ch : /[a-zA-Z]/.test(ch) ? ch.toUpperCase() : ' '))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export interface AnnouncementParams {
  queueNumber: string
  queueTypeName?: string | null
  counterName?: string | null
  priority?: boolean
}

/**
 * Kalimat panggilan, dipisah dari mesin suaranya.
 *
 * Suara peramban dan TTS eksternal harus mengucapkan kalimat yang sama persis —
 * kalau tiap jalur merangkai kalimatnya sendiri, keduanya pelan-pelan berbeda dan
 * tidak ada yang menyadarinya sampai ada yang mendengarkan keduanya berdampingan.
 */
export function announcementText(params: AnnouncementParams): string {
  // Kata "prioritas" diletakkan di depan supaya terdengar sebelum nomornya —
  // pengunjung lain jadi paham kenapa nomor itu dipanggil lebih dulu.
  const parts = [
    params.priority
      ? `Antrean prioritas, nomor ${spellQueueNumber(params.queueNumber)}`
      : `Nomor antrean, ${spellQueueNumber(params.queueNumber)}`,
  ]
  if (params.counterName) parts.push(`silakan menuju ${params.counterName}`)
  else if (params.queueTypeName) parts.push(`silakan menuju ${params.queueTypeName}`)
  return parts.join(', ') + '.'
}

export function useSpeech(initial: Partial<SpeechSettings> = {}) {
  const settings = reactive<SpeechSettings>({ ...DEFAULT_SPEECH, ...initial })
  const supported = ref(false)
  const speaking = ref(false)
  const voices = ref<SpeechSynthesisVoice[]>([])

  /** Antrean ucapan: panggilan beruntun tidak boleh saling menimpa. */
  const queue: string[] = []
  let draining = false

  function loadVoices() {
    if (!supported.value) return
    voices.value = window.speechSynthesis.getVoices()
  }

  onMounted(() => {
    supported.value = typeof window !== 'undefined' && 'speechSynthesis' in window
    if (!supported.value) return
    loadVoices()
    window.speechSynthesis.onvoiceschanged = loadVoices
  })

  function pickVoice(): SpeechSynthesisVoice | null {
    if (!voices.value.length) return null
    if (settings.voiceName) {
      const exact = voices.value.find(v => v.name === settings.voiceName)
      if (exact) return exact
    }
    return (
      voices.value.find(v => v.lang === settings.language)
      ?? voices.value.find(v => v.lang.startsWith(settings.language.split('-')[0]!))
      ?? null
    )
  }

  function drain() {
    if (draining || !queue.length || !supported.value) return
    draining = true
    speaking.value = true

    const text = queue.shift()!
    const utter = new SpeechSynthesisUtterance(text)
    utter.lang = settings.language
    utter.rate = settings.rate
    utter.pitch = settings.pitch
    utter.volume = settings.volume
    const voice = pickVoice()
    if (voice) utter.voice = voice

    utter.onend = utter.onerror = () => {
      draining = false
      speaking.value = queue.length > 0
      drain()
    }

    window.speechSynthesis.speak(utter)
  }

  function speak(text: string, times = settings.repeat) {
    if (!settings.enabled || !supported.value || !text) return
    for (let i = 0; i < Math.max(1, times); i++) queue.push(text)
    drain()
  }

  /** "Nomor antrean A 0 2 3, silakan menuju Loket 1." */
  function announceQueue(params: AnnouncementParams) {
    speak(announcementText(params))
  }

  function cancel() {
    queue.length = 0
    draining = false
    speaking.value = false
    if (supported.value) window.speechSynthesis.cancel()
  }

  onBeforeUnmount(cancel)

  return { settings, supported, speaking, voices, speak, announceQueue, cancel }
}
