<script setup lang="ts">
/**
 * Widget anti-bot Cloudflare Turnstile (§36).
 * Token yang dihasilkan dikirim bersama permintaan pengambilan antrean dan
 * diverifikasi ulang di server — nilai di klien tidak pernah dipercaya sendiri.
 */
const props = defineProps<{ siteKey: string }>()
const token = defineModel<string>({ default: '' })

const container = ref<HTMLElement | null>(null)
const status = ref<'loading' | 'ready' | 'error'>('loading')
let widgetId: string | undefined

interface Turnstile {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string
  reset: (id?: string) => void
  remove: (id?: string) => void
}
declare global {
  interface Window { turnstile?: Turnstile }
}

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve()

  const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`)
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener('load', () => resolve())
      existing.addEventListener('error', () => reject(new Error('gagal memuat')))
    })
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = SCRIPT_SRC
    script.async = true
    script.defer = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('gagal memuat'))
    document.head.appendChild(script)
  })
}

onMounted(async () => {
  try {
    await loadScript()
    if (!container.value || !window.turnstile) throw new Error('turnstile tidak tersedia')

    widgetId = window.turnstile.render(container.value, {
      'sitekey': props.siteKey,
      'theme': 'auto',
      'callback': (value: string) => { token.value = value },
      'expired-callback': () => { token.value = '' },
      'error-callback': () => { token.value = ''; status.value = 'error' },
    })
    status.value = 'ready'
  }
  catch {
    status.value = 'error'
  }
})

onBeforeUnmount(() => {
  if (widgetId && window.turnstile) window.turnstile.remove(widgetId)
})

/** Dipanggil halaman setelah submit gagal, supaya token sekali-pakai diperbarui. */
function reset() {
  token.value = ''
  if (widgetId && window.turnstile) window.turnstile.reset(widgetId)
}

defineExpose({ reset })
</script>

<template>
  <div>
    <div ref="container" />
    <p v-if="status === 'loading'" class="text-xs text-slate-400">
      Memuat verifikasi anti-bot…
    </p>
    <p v-else-if="status === 'error'" class="text-xs text-rose-600">
      Verifikasi anti-bot gagal dimuat. Periksa koneksi lalu muat ulang halaman.
    </p>
  </div>
</template>
