import { io, type Socket } from 'socket.io-client'
import { SOCKET_PATH } from '#shared/constants/socket'

export interface SocketAuth {
  role: 'admin' | 'operator' | 'display' | 'visitor'
  eventId?: string
  queueTypeId?: string
  deviceCode?: string
  deviceToken?: string
  publicToken?: string
}

export interface UseSocketOptions {
  /**
   * Tunda koneksi sampai `connect()` dipanggil manual.
   * Dipakai halaman display: pairing harus selesai dulu supaya token ikut terkirim.
   */
  manual?: boolean
}

/**
 * Koneksi realtime (§35, §44).
 *
 * `auth` boleh berupa fungsi supaya nilainya dibaca tepat sebelum koneksi dibuka —
 * bukan saat setup. Ini penting untuk token yang baru tersedia di `onMounted`
 * (mis. device token display yang disimpan di localStorage).
 *
 * Reconnect otomatis dengan exponential backoff bawaan Socket.IO; status koneksi
 * diekspos supaya display bisa menampilkan indikator ONLINE/OFFLINE dan halaman lain
 * bisa jatuh ke polling saat terputus.
 */
export function useSocket(auth: SocketAuth | (() => SocketAuth), options: UseSocketOptions = {}) {
  const socket = shallowRef<Socket | null>(null)
  const connected = ref(false)
  const rejected = ref(false)
  const lastError = ref<string | null>(null)
  const lastMessageAt = ref<Date | null>(null)
  const transport = ref<string>('')
  const listeners: Array<[string, (payload: never) => void]> = []

  const resolveAuth = () => (typeof auth === 'function' ? auth() : auth)

  function on<T = unknown>(eventName: string, handler: (payload: T) => void) {
    listeners.push([eventName, handler as (payload: never) => void])
    socket.value?.on(eventName, handler as never)
  }

  function emit(eventName: string, payload?: unknown) {
    socket.value?.emit(eventName, payload)
  }

  function close() {
    socket.value?.removeAllListeners()
    socket.value?.close()
    socket.value = null
    connected.value = false
  }

  function connect() {
    close()
    rejected.value = false
    lastError.value = null

    const instance = io({
      path: SOCKET_PATH,
      auth: resolveAuth() as unknown as Record<string, unknown>,
      transports: ['polling', 'websocket'],
      reconnection: true,
      reconnectionDelay: 500,
      reconnectionDelayMax: 10_000,
      randomizationFactor: 0.5,
    })

    instance.on('connect', () => {
      connected.value = true
      rejected.value = false
      transport.value = instance.io.engine.transport.name
      instance.io.engine.on('upgrade', (t) => { transport.value = t.name })
    })
    instance.on('disconnect', () => { connected.value = false })
    instance.on('connect_error', (err) => {
      connected.value = false
      lastError.value = err.message
    })
    // Server menolak identitas (mis. token display salah) — jangan diam-diam.
    instance.on('error', (payload: { message?: string }) => {
      rejected.value = true
      lastError.value = payload?.message ?? 'Koneksi ditolak server'
    })
    instance.onAny(() => { lastMessageAt.value = new Date() })

    for (const [name, handler] of listeners) instance.on(name, handler as never)

    socket.value = instance
    return instance
  }

  /** Sambung ulang dengan nilai auth terbaru — mis. setelah admin berganti event. */
  function reconnect() {
    if (socket.value || !options.manual) connect()
  }

  onMounted(() => {
    if (!options.manual) connect()
  })

  onBeforeUnmount(close)

  return { socket, connected, rejected, lastError, transport, lastMessageAt, on, emit, connect, reconnect, close }
}
