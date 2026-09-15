/** Nama event WebSocket (§35). Dipakai bersama oleh server emitter dan klien. */
export const SOCKET_EVENTS = {
  QUEUE_CREATED: 'queue.created',
  QUEUE_CALLED: 'queue.called',
  QUEUE_RECALLED: 'queue.recalled',
  QUEUE_SKIPPED: 'queue.skipped',
  QUEUE_SERVING: 'queue.serving',
  QUEUE_COMPLETED: 'queue.completed',
  QUEUE_CANCELLED: 'queue.cancelled',
  QUEUE_UPDATED: 'queue.updated',
  DISPLAY_UPDATED: 'display.updated',
  DISPLAY_RELOAD: 'display.reload',
  ANNOUNCEMENT_CREATED: 'announcement.created',
  EVENT_OPENED: 'event.opened',
  EVENT_CLOSED: 'event.closed',
  EVENT_PAUSED: 'event.paused',
  STATE_SNAPSHOT: 'state.snapshot',
  NOTIFICATION: 'notification',
} as const

export type SocketEvent = (typeof SOCKET_EVENTS)[keyof typeof SOCKET_EVENTS]

/** Room helper — satu-satunya sumber penamaan room, jangan hardcode string di tempat lain. */
export const ROOMS = {
  event: (eventId: string) => `event:${eventId}`,
  queueType: (queueTypeId: string) => `queue-type:${queueTypeId}`,
  queueToken: (publicToken: string) => `queue:${publicToken}`,
  display: (deviceId: string) => `display:${deviceId}`,
  admin: (organizationId: string) => `admin:${organizationId}`,
}

export const SOCKET_PATH = '/socket.io'
