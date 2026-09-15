import type { Server as IOServer, Socket } from 'socket.io'
import { prisma } from '../utils/prisma'
import { auth } from '../utils/auth'
import { hashToken } from '../utils/crypto'
import { touchDevice } from '../services/display.service'
import { createLogger } from '../utils/logger'
import { ROOMS, SOCKET_EVENTS } from '../../shared/constants/socket'

const log = createLogger('socket')

export interface HandshakeAuth {
  /** siapa yang menyambung */
  role?: 'admin' | 'operator' | 'display' | 'visitor'
  eventId?: string
  queueTypeId?: string
  deviceCode?: string
  deviceToken?: string
  publicToken?: string
}

/**
 * Otentikasi & pendaftaran room (§35).
 *
 * Aturan penting: klien TIDAK boleh menentukan sendiri room mana yang ia ikuti.
 * Server yang memutuskan berdasarkan identitas yang bisa diverifikasi.
 */
export function registerSocketHandlers(io: IOServer) {
  io.on('connection', async (socket: Socket) => {
    const handshake = (socket.handshake.auth ?? {}) as HandshakeAuth

    try {
      switch (handshake.role) {
        case 'visitor':
          await joinVisitor(socket, handshake)
          break
        case 'display':
          await joinDisplay(socket, handshake)
          break
        default:
          await joinUser(socket, handshake)
      }
    }
    catch (error) {
      log.warn('koneksi socket ditolak', { message: (error as Error).message })
      socket.emit('error', { message: 'Koneksi tidak diizinkan' })
      socket.disconnect(true)
      return
    }

    socket.on('disconnect', (reason) => {
      log.debug('socket terputus', { id: socket.id, reason })
    })
  })
}

/** Pengunjung: hanya boleh mendengarkan antreannya sendiri. */
async function joinVisitor(socket: Socket, handshake: HandshakeAuth) {
  if (!handshake.publicToken) throw new Error('publicToken wajib')

  const queue = await prisma.queue.findFirst({
    where: { publicToken: handshake.publicToken, deletedAt: null },
    select: { id: true, eventId: true, queueTypeId: true, publicToken: true },
  })
  if (!queue) throw new Error('Antrean tidak ditemukan')

  await socket.join(ROOMS.queueToken(queue.publicToken))
  await socket.join(ROOMS.queueType(queue.queueTypeId))
  socket.emit(SOCKET_EVENTS.STATE_SNAPSHOT, { role: 'visitor', queueId: queue.id })
}

/** Perangkat display: identitas lewat device code + token yang disimpan ter-hash. */
async function joinDisplay(socket: Socket, handshake: HandshakeAuth) {
  if (!handshake.deviceCode) throw new Error('deviceCode wajib')

  const device = await prisma.displayDevice.findFirst({
    where: { deviceCode: handshake.deviceCode, deletedAt: null },
    select: { id: true, eventId: true, queueTypeId: true, deviceTokenHash: true },
  })
  if (!device) throw new Error('Perangkat display tidak ditemukan')

  if (device.deviceTokenHash) {
    if (!handshake.deviceToken || hashToken(handshake.deviceToken) !== device.deviceTokenHash) {
      throw new Error('Token perangkat tidak valid')
    }
  }

  await socket.join(ROOMS.display(device.id))
  await socket.join(ROOMS.event(device.eventId))
  if (device.queueTypeId) await socket.join(ROOMS.queueType(device.queueTypeId))

  await prisma.displayDevice.update({
    where: { id: device.id },
    data: { status: 'ONLINE', lastSeenAt: new Date() },
  }).catch(() => {})

  let lastTouchedAt = new Date()

  socket.on('disconnect', async () => {
    await prisma.displayDevice.update({
      where: { id: device.id },
      data: { status: 'OFFLINE', lastSeenAt: new Date() },
    }).catch(() => {})
  })

  // Heartbeat tiap 10 detik dari display, tetapi tulisannya dibatasi sekali per menit.
  socket.on('display:ping', async () => {
    if (await touchDevice(device.id, lastTouchedAt)) lastTouchedAt = new Date()
  })

  socket.emit(SOCKET_EVENTS.STATE_SNAPSHOT, { role: 'display', deviceId: device.id })
}

/** Admin & operator: identitas dari cookie sesi Better Auth. */
async function joinUser(socket: Socket, handshake: HandshakeAuth) {
  const cookie = socket.handshake.headers.cookie
  if (!cookie) throw new Error('Sesi tidak ditemukan')

  const session = await auth.api.getSession({ headers: new Headers({ cookie }) })
  if (!session?.user) throw new Error('Sesi tidak valid')

  const user = await prisma.user.findFirst({
    where: { id: session.user.id, deletedAt: null, isActive: true },
    select: {
      id: true,
      organizationId: true,
      // Room realtime mengikuti loket: layanan apa saja yang dilayaninya, dan event-nya.
      assignment: {
        select: {
          counter: {
            select: { eventId: true, services: { select: { queueTypeId: true } } },
          },
        },
      },
      userRoles: { select: { role: { select: { key: true } } } },
    },
  })
  if (!user) throw new Error('Pengguna tidak aktif')

  if (user.organizationId) await socket.join(ROOMS.admin(user.organizationId))

  // Operator mengikuti seluruh layanan loketnya, plus kanal event pemilik loket.
  const seat = user.assignment?.counter
  if (seat) {
    await socket.join(ROOMS.event(seat.eventId))
    for (const service of seat.services) {
      await socket.join(ROOMS.queueType(service.queueTypeId))
    }
  }

  const isPrivileged = user.userRoles.some(r => ['SUPERADMIN', 'ADMIN', 'VIEWER'].includes(r.role.key))
  if (isPrivileged && handshake.eventId) {
    const event = await prisma.event.findFirst({
      where: { id: handshake.eventId, organizationId: user.organizationId ?? undefined, deletedAt: null },
      select: { id: true },
    })
    if (event) await socket.join(ROOMS.event(event.id))
  }

  socket.emit(SOCKET_EVENTS.STATE_SNAPSHOT, { role: 'user', userId: user.id })
}
