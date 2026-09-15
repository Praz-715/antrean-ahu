import { Server as Engine } from 'engine.io'
import { Server as IOServer } from 'socket.io'
import { defineEventHandler } from 'h3'
import { registerIo } from '../realtime/emitters'
import { registerSocketHandlers } from '../realtime/handlers'
import { createLogger } from '../utils/logger'
import { SOCKET_PATH } from '../../shared/constants/socket'

const log = createLogger('socket')

/**
 * Pasang Socket.IO ke dalam proses Nitro (§35).
 *
 * Engine.IO menangani transport HTTP long-polling lewat router Nitro, sedangkan
 * upgrade WebSocket dijembatani ke handler websocket milik Nitro (crossws).
 * Dengan begitu satu port melayani aplikasi sekaligus realtime.
 */
export default defineNitroPlugin((nitroApp) => {
  const engine = new Engine({ pingInterval: 25_000, pingTimeout: 20_000 })
  const io = new IOServer({ path: SOCKET_PATH, serveClient: false })

  io.bind(engine as never)
  registerSocketHandlers(io)
  registerIo(io)

  /**
   * Koneksi yang putus mendadak TIDAK boleh menjatuhkan server.
   *
   * Perangkat display dicabut dari listrik, ponsel pengunjung kehilangan sinyal,
   * atau tab ditutup di tengah upgrade websocket — semuanya berakhir sebagai
   * `ECONNRESET` pada socket yang sudah tidak punya penangan. Node menganggap
   * penolakan tanpa penangan sebagai galat fatal, jadi satu pengunjung yang
   * kehilangan sinyal cukup untuk mematikan proses yang melayani seluruh loket.
   * Terbukti terjadi: server dev mati beberapa kali saat peramban uji ditutup paksa.
   *
   * Yang diredam hanya galat jaringan yang memang tidak bisa ditindaklanjuti;
   * galat lain tetap dicatat apa adanya.
   */
  const GALAT_JARINGAN_BIASA = new Set(['ECONNRESET', 'EPIPE', 'ECANCELED', 'ETIMEDOUT'])

  engine.on('connection', (socket: { on: (ev: string, cb: (e: unknown) => void) => void }) => {
    socket.on('error', (error) => {
      const code = (error as { code?: string })?.code
      if (code && GALAT_JARINGAN_BIASA.has(code)) return
      log.warn('galat socket', { message: (error as Error)?.message ?? String(error) })
    })
  })

  engine.on('connection_error', (error: { code?: number, message?: string }) => {
    log.debug('koneksi socket ditolak', { code: error?.code, message: error?.message })
  })

  nitroApp.router.use(
    `${SOCKET_PATH}/`,
    defineEventHandler({
      handler(event) {
        engine.handleRequest(event.node.req as never, event.node.res as never)
        event._handled = true
      },
      websocket: {
        open(peer) {
          const internal = (peer as unknown as { _internal: { nodeReq: never, ws: never } })._internal
          const nodeReq = internal?.nodeReq as unknown as { socket: unknown } | undefined
          if (!nodeReq || !internal?.ws) {
            log.warn('upgrade websocket tanpa konteks node, mengandalkan fallback polling')
            return
          }
          /**
           * Socket mentahnya diberi penangan galat sebelum diserahkan ke engine.io.
           * Klien yang pergi di tengah upgrade websocket meninggalkan ECONNRESET pada
           * socket ini; tanpa penangan, galatnya naik menjadi unhandled rejection.
           */
          const rawSocket = nodeReq.socket as { on?: (ev: string, cb: (e: unknown) => void) => void }
          rawSocket.on?.('error', () => {})

          // @ts-expect-error API internal engine.io
          engine.prepare(nodeReq)
          // @ts-expect-error API internal engine.io
          engine.onWebSocket(nodeReq, nodeReq.socket, internal.ws)
        },
      },
    }),
  )

  nitroApp.hooks.hook('close', async () => {
    await io.close()
  })

  log.info('socket.io siap', { path: SOCKET_PATH })
})
