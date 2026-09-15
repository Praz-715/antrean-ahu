import type { Server as IOServer } from 'socket.io'
import { ROOMS, SOCKET_EVENTS } from '../../shared/constants/socket'
import { createLogger } from '../utils/logger'

const log = createLogger('realtime')

/**
 * Registry instance Socket.IO. Diisi oleh server/plugins/socket.ts saat Nitro start.
 * Seluruh emit di aplikasi lewat modul ini — tidak ada `io.emit` liar di service.
 *
 * Emit SELALU dipanggil setelah transaksi database commit (§14, §35).
 */
let io: IOServer | null = null

export function registerIo(server: IOServer) {
  io = server
  log.info('socket.io terhubung ke emitter')
}

function emit(room: string, event: string, payload: unknown) {
  if (!io) return
  io.to(room).emit(event, payload)
}

export interface QueueBroadcastPayload {
  queueId: string
  queueNumber: string
  status: string
  eventId: string
  queueTypeId: string
  queueTypeName: string
  queueTypeCode: string
  queueTypeColor?: string | null
  counterName?: string | null
  operatorName?: string | null
  publicToken?: string
  visitorName?: string | null
  calledAt?: string | null
  recallCount?: number
  /** Tingkat prioritas; display memakainya untuk tampilan khusus. */
  priority?: number
  serviceDate: string
}

/** Broadcast satu perubahan antrean ke seluruh kanal yang relevan sekaligus. */
export function emitQueueEvent(
  eventName: string,
  payload: QueueBroadcastPayload,
  organizationId?: string,
) {
  emit(ROOMS.event(payload.eventId), eventName, payload)
  emit(ROOMS.queueType(payload.queueTypeId), eventName, payload)
  if (payload.publicToken) emit(ROOMS.queueToken(payload.publicToken), eventName, payload)
  if (organizationId) emit(ROOMS.admin(organizationId), eventName, payload)
}

export function emitEventStatus(eventId: string, organizationId: string, status: string) {
  const name = status === 'OPEN'
    ? SOCKET_EVENTS.EVENT_OPENED
    : status === 'PAUSED'
      ? SOCKET_EVENTS.EVENT_PAUSED
      : SOCKET_EVENTS.EVENT_CLOSED

  const payload = { eventId, status, at: new Date().toISOString() }
  emit(ROOMS.event(eventId), name, payload)
  emit(ROOMS.admin(organizationId), name, payload)
}

export function emitDisplayReload(deviceId: string) {
  emit(ROOMS.display(deviceId), SOCKET_EVENTS.DISPLAY_RELOAD, { deviceId })
}

export function emitAnnouncement(eventId: string, announcement: unknown) {
  emit(ROOMS.event(eventId), SOCKET_EVENTS.ANNOUNCEMENT_CREATED, announcement)
}

/** Pemberitahuan dalam aplikasi untuk panel admin yang sedang terbuka (§47). */
export function emitNotification(organizationId: string, notification: unknown) {
  emit(ROOMS.admin(organizationId), SOCKET_EVENTS.NOTIFICATION, notification)
}
