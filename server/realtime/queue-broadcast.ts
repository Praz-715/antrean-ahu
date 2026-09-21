import { emitQueueEvent, type QueueBroadcastPayload } from './emitters'
import { formatServiceDate } from '../utils/datetime'
import { SOCKET_EVENTS } from '../../shared/constants/socket'

/** Bentuk queue hasil service operator (sudah include relasi standar). */
export interface BroadcastableQueue {
  id: string
  queueNumber: string
  status: string
  eventId: string
  queueTypeId: string
  organizationId: string
  publicToken: string
  recallCount: number
  priority: number
  serviceDate: Date
  calledAt: Date | null
  queueType: { id: string, code: string, name: string, color: string }
  counter?: { id: string, code: string, name: string } | null
  operator?: { id: string, name: string } | null
  visitor?: { fullName: string | null } | null
}

export function toBroadcastPayload(queue: BroadcastableQueue): QueueBroadcastPayload {
  return {
    queueId: queue.id,
    queueNumber: queue.queueNumber,
    status: queue.status,
    eventId: queue.eventId,
    queueTypeId: queue.queueTypeId,
    queueTypeName: queue.queueType.name,
    queueTypeCode: queue.queueType.code,
    queueTypeColor: queue.queueType.color,
    counterName: queue.counter?.name ?? null,
    operatorName: queue.operator?.name ?? null,
    publicToken: queue.publicToken,
    visitorName: queue.visitor?.fullName ?? null,
    calledAt: queue.calledAt ? queue.calledAt.toISOString() : null,
    recallCount: queue.recallCount,
    priority: queue.priority,
    serviceDate: formatServiceDate(queue.serviceDate),
  }
}

/** Siarkan perubahan antrean ke event, jenis antrean, pengunjung, dan admin sekaligus. */
export function broadcastQueue(eventName: string, queue: BroadcastableQueue) {
  emitQueueEvent(eventName, toBroadcastPayload(queue), queue.organizationId)
}
/**
 * Siarkan nomor yang hangus sebagai efek samping sebuah panggilan.
 *
 * Pemanggilan mengembalikan antrean yang dipanggil beserta `hangus` — nomor lain
 * yang giliran tunggunya habis karena panggilan itu. Pengunjung hanya berlangganan
 * kamar nomornya sendiri, jadi tanpa siaran ini halaman tiketnya tidak pernah tahu
 * nomornya sudah tidak berlaku sampai ia memuat ulang halaman.
 */
export function broadcastHangus(hasil: unknown) {
  const daftar = (hasil as { hangus?: BroadcastableQueue[] }).hangus ?? []
  for (const queue of daftar) broadcastQueue(SOCKET_EVENTS.QUEUE_UPDATED, queue)
}
