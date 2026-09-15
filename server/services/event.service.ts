import type { EventModel } from '../../generated/prisma/models'
import { prisma } from '../utils/prisma'
import { newId, slugify } from '../utils/id'
import { errors } from '../utils/response'
import { ERROR_CODES } from '../../shared/constants/errors'
import {
  dayOfWeekInTz,
  minutesOfDay,
  nowMinutesInTz,
  parseServiceDate,
  serviceDateString,
} from '../utils/datetime'
import type { CreateEventInput, ScheduleItemInput, UpdateEventInput } from '../../shared/schemas/event'

export interface EventOpenState {
  isOpen: boolean
  /** true jika event menerima pengambilan antrean baru */
  acceptsNewQueue: boolean
  reason: 'OPEN' | 'NOT_OPEN' | 'PAUSED' | 'OUTSIDE_HOURS' | 'DAY_CLOSED'
  message: string
  openTime: string | null
  closeTime: string | null
  serviceDate: string
}

export const eventService = {
  async list(organizationId: string, params: { search?: string, status?: string } = {}) {
    return prisma.event.findMany({
      where: {
        organizationId,
        deletedAt: null,
        ...(params.status ? { status: params.status as EventModel['status'] } : {}),
        ...(params.search
          ? { OR: [{ name: { contains: params.search } }, { slug: { contains: params.search } }] }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }],
      include: {
        _count: { select: { queueTypes: true, counters: true, queues: true } },
      },
    })
  },

  async getById(organizationId: string, id: string) {
    const event = await prisma.event.findFirst({
      where: { id, organizationId, deletedAt: null },
      include: {
        schedules: { orderBy: [{ overrideDate: 'asc' }, { dayOfWeek: 'asc' }] },
        queueTypes: { where: { deletedAt: null }, orderBy: { displayOrder: 'asc' } },
        counters: { orderBy: { displayOrder: 'asc' } },
        _count: { select: { queues: true, visitors: true } },
      },
    })
    if (!event) throw errors.notFound('Event tidak ditemukan')
    return event
  },

  /** Dipakai internal (public registration, operator) — tanpa scoping organisasi. */
  async getByIdRaw(id: string) {
    const event = await prisma.event.findFirst({ where: { id, deletedAt: null } })
    if (!event) throw errors.notFound('Event tidak ditemukan')
    return event
  },

  async create(organizationId: string, input: CreateEventInput) {
    const slug = await this.uniqueSlug(organizationId, input.slug || slugify(input.name))

    return prisma.event.create({
      data: {
        id: newId(),
        organizationId,
        name: input.name,
        slug,
        description: input.description ?? null,
        timezone: input.timezone,
        startDate: input.startDate ? parseServiceDate(input.startDate) : null,
        endDate: input.endDate ? parseServiceDate(input.endDate) : null,
        allowFinishAfterClose: input.allowFinishAfterClose,
        branding: (input.branding ?? undefined) as never,
        settings: (input.settings ?? undefined) as never,
        status: 'DRAFT',
        // jadwal bawaan: Senin–Sabtu 08:00–16:00, Minggu tutup
        schedules: {
          create: Array.from({ length: 7 }, (_, day) => ({
            id: newId(),
            dayOfWeek: day,
            openTime: '08:00',
            closeTime: '16:00',
            isClosed: day === 0,
          })),
        },
      },
    })
  },

  async update(organizationId: string, id: string, input: UpdateEventInput) {
    await this.getById(organizationId, id)

    const slug = input.slug ? await this.uniqueSlug(organizationId, input.slug, id) : undefined

    return prisma.event.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(slug ? { slug } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
        ...(input.startDate !== undefined
          ? { startDate: input.startDate ? parseServiceDate(input.startDate) : null }
          : {}),
        ...(input.endDate !== undefined
          ? { endDate: input.endDate ? parseServiceDate(input.endDate) : null }
          : {}),
        ...(input.allowFinishAfterClose !== undefined
          ? { allowFinishAfterClose: input.allowFinishAfterClose }
          : {}),
        ...(input.branding !== undefined ? { branding: input.branding as never } : {}),
        ...(input.settings !== undefined ? { settings: input.settings as never } : {}),
      },
    })
  },

  async setStatus(organizationId: string, id: string, status: EventModel['status']) {
    const event = await this.getById(organizationId, id)

    const allowed: Record<string, EventModel['status'][]> = {
      DRAFT: ['SCHEDULED', 'OPEN', 'CLOSED'],
      SCHEDULED: ['OPEN', 'DRAFT', 'CLOSED'],
      OPEN: ['PAUSED', 'CLOSED'],
      PAUSED: ['OPEN', 'CLOSED'],
      CLOSED: ['OPEN', 'COMPLETED', 'SCHEDULED'],
      COMPLETED: [],
    }

    if (event.status !== status && !allowed[event.status]?.includes(status)) {
      throw errors.badRequest(
        ERROR_CODES.CONFLICT,
        `Status tidak dapat berubah dari ${event.status} ke ${status}`,
      )
    }

    return prisma.event.update({ where: { id }, data: { status } })
  },

  async softDelete(organizationId: string, id: string) {
    const event = await this.getById(organizationId, id)

    const activeQueues = await prisma.queue.count({
      where: { eventId: id, status: { in: ['WAITING', 'CALLED', 'SERVING'] }, deletedAt: null },
    })
    if (activeQueues > 0) {
      throw errors.conflict(
        ERROR_CODES.CONFLICT,
        `Masih ada ${activeQueues} antrean aktif. Selesaikan atau batalkan dahulu.`,
      )
    }

    await prisma.event.update({ where: { id }, data: { deletedAt: new Date() } })
    return event
  },

  async replaceWeeklySchedules(organizationId: string, id: string, schedules: ScheduleItemInput[]) {
    await this.getById(organizationId, id)

    await prisma.$transaction(async (tx) => {
      await tx.eventSchedule.deleteMany({ where: { eventId: id, overrideDate: null } })
      if (schedules.length) {
        await tx.eventSchedule.createMany({
          data: schedules.map(s => ({
            id: newId(),
            eventId: id,
            dayOfWeek: s.dayOfWeek,
            openTime: s.openTime,
            closeTime: s.closeTime,
            isClosed: s.isClosed,
            note: s.note ?? null,
          })),
        })
      }
    })

    return prisma.eventSchedule.findMany({
      where: { eventId: id, overrideDate: null },
      orderBy: { dayOfWeek: 'asc' },
    })
  },

  /**
   * Apakah event sedang melayani? (§9, §10)
   * Jam operasional dievaluasi pada timezone EVENT, bukan timezone server.
   */
  async getOpenState(eventId: string, at: Date = new Date()): Promise<EventOpenState> {
    const event = await prisma.event.findFirst({
      where: { id: eventId, deletedAt: null },
      select: { id: true, status: true, timezone: true },
    })
    if (!event) throw errors.notFound('Event tidak ditemukan')

    const tz = event.timezone
    const serviceDate = serviceDateString(tz, at)
    const base = { serviceDate, openTime: null, closeTime: null }

    if (event.status === 'PAUSED') {
      return { ...base, isOpen: false, acceptsNewQueue: false, reason: 'PAUSED', message: 'Antrean sedang dijeda sementara' }
    }
    if (event.status !== 'OPEN') {
      return { ...base, isOpen: false, acceptsNewQueue: false, reason: 'NOT_OPEN', message: 'Layanan sedang tidak dibuka' }
    }

    const override = await prisma.eventSchedule.findFirst({
      where: { eventId, overrideDate: parseServiceDate(serviceDate) },
    })
    const schedule = override ?? await prisma.eventSchedule.findFirst({
      where: { eventId, dayOfWeek: dayOfWeekInTz(tz, at), overrideDate: null },
    })

    if (!schedule || schedule.isClosed) {
      return {
        ...base,
        isOpen: false,
        acceptsNewQueue: false,
        reason: 'DAY_CLOSED',
        message: 'Hari ini tidak ada jadwal pelayanan',
      }
    }

    const now = nowMinutesInTz(tz, at)
    const open = minutesOfDay(schedule.openTime)
    const close = minutesOfDay(schedule.closeTime)
    const withinHours = now >= open && now < close

    return {
      serviceDate,
      openTime: schedule.openTime,
      closeTime: schedule.closeTime,
      isOpen: withinHours,
      acceptsNewQueue: withinHours,
      reason: withinHours ? 'OPEN' : 'OUTSIDE_HOURS',
      message: withinHours
        ? 'Layanan sedang dibuka'
        : `Layanan buka pukul ${schedule.openTime} – ${schedule.closeTime}`,
    }
  },

  /** Lempar error bila event tidak menerima antrean baru (§57.11). */
  async assertAcceptsNewQueue(eventId: string) {
    const state = await this.getOpenState(eventId)
    if (state.acceptsNewQueue) return state

    const code = state.reason === 'PAUSED'
      ? ERROR_CODES.EVENT_PAUSED
      : state.reason === 'OUTSIDE_HOURS' || state.reason === 'DAY_CLOSED'
        ? ERROR_CODES.OUTSIDE_SERVICE_HOURS
        : ERROR_CODES.EVENT_NOT_OPEN

    throw errors.badRequest(code, state.message)
  },

  async uniqueSlug(organizationId: string, base: string, excludeId?: string): Promise<string> {
    const root = slugify(base) || 'event'
    let candidate = root
    let n = 1
    while (true) {
      const clash = await prisma.event.findFirst({
        where: { organizationId, slug: candidate, ...(excludeId ? { id: { not: excludeId } } : {}) },
        select: { id: true },
      })
      if (!clash) return candidate
      candidate = `${root}-${++n}`
    }
  },
}
