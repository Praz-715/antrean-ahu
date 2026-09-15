/**
 * Mode layar penuh untuk halaman display (§17, §45).
 *
 * Layar antrean hampir selalu dipasang di televisi atau kiosk, dan bilah alamat
 * peramban di atasnya hanya memakan ruang yang seharusnya jadi nomor antrean.
 * Tombol ini dipakai sekali saat perangkat dipasang — sesudahnya layar tinggal
 * dibiarkan menyala.
 *
 * Status dibaca dari peramban lewat event `fullscreenchange`, bukan disimpan
 * sendiri: pengguna bisa keluar dengan Esc tanpa menyentuh tombol apa pun, dan
 * ikon yang tertinggal pada keadaan lama akan menyesatkan.
 */

/** Bentuk berprefiks WebKit — masih dibutuhkan Safari, termasuk iPad yang sering dipakai sebagai layar. */
interface WebkitDocument extends Document {
  webkitFullscreenElement?: Element | null
  webkitExitFullscreen?: () => Promise<void> | void
}

interface WebkitElement extends HTMLElement {
  webkitRequestFullscreen?: () => Promise<void> | void
}

export function useFullscreen() {
  const isFullscreen = ref(false)
  const supported = ref(false)
  const lastError = ref<string | null>(null)

  function currentElement(): Element | null {
    if (!import.meta.client) return null
    const doc = document as WebkitDocument
    return doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null
  }

  function sync() {
    isFullscreen.value = !!currentElement()
  }

  async function enter() {
    if (!import.meta.client) return
    const target = document.documentElement as WebkitElement
    try {
      if (target.requestFullscreen) await target.requestFullscreen({ navigationUI: 'hide' })
      else if (target.webkitRequestFullscreen) await target.webkitRequestFullscreen()
      lastError.value = null
    }
    catch (error) {
      // Peramban boleh menolak (mis. bukan dari gestur pengguna). Jangan diam-diam.
      lastError.value = (error as Error).message
    }
    sync()
  }

  async function exit() {
    if (!import.meta.client) return
    const doc = document as WebkitDocument
    try {
      if (doc.exitFullscreen) await doc.exitFullscreen()
      else if (doc.webkitExitFullscreen) await doc.webkitExitFullscreen()
    }
    catch (error) {
      lastError.value = (error as Error).message
    }
    sync()
  }

  function toggle() {
    return isFullscreen.value ? exit() : enter()
  }

  onMounted(() => {
    const target = document.documentElement as WebkitElement
    supported.value = Boolean(
      document.fullscreenEnabled
      || target.requestFullscreen
      || target.webkitRequestFullscreen,
    )
    sync()
    document.addEventListener('fullscreenchange', sync)
    document.addEventListener('webkitfullscreenchange', sync)
  })

  onBeforeUnmount(() => {
    if (!import.meta.client) return
    document.removeEventListener('fullscreenchange', sync)
    document.removeEventListener('webkitfullscreenchange', sync)
  })

  return { isFullscreen, supported, lastError, enter, exit, toggle }
}
