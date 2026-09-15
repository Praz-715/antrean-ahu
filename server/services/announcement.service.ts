import { prisma } from '../utils/prisma'
import { errors } from '../utils/response'
import { newId } from '../utils/id'

export interface AnnouncementInput {
  title?: string | null
  message: string
  type?: 'TEXT' | 'RUNNING_TEXT'
  priority?: number
  startsAt?: string | null
  endsAt?: string | null
  isActive?: boolean
}

async function assertEvent(organizationId: string, eventId: string) {
  const event = await prisma.event.findFirst({
    where: { id: eventId, organizationId, deletedAt: null },
    select: { id: true },
  })
  if (!event) throw errors.notFound('Event tidak ditemukan')
  return event
}

/** Pengumuman yang tampil pada layar display (§21). */
export const announcementService = {
  async list(organizationId: string, eventId: string) {
    await assertEvent(organizationId, eventId)
    return prisma.announcement.findMany({
      where: { eventId },
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
    })
  },

  async getById(organizationId: string, id: string) {
    const announcement = await prisma.announcement.findFirst({
      where: { id, event: { organizationId, deletedAt: null } },
    })
    if (!announcement) throw errors.notFound('Pengumuman tidak ditemukan')
    return announcement
  },

  async create(organizationId: string, eventId: string, input: AnnouncementInput) {
    await assertEvent(organizationId, eventId)
    return prisma.announcement.create({
      data: {
        id: newId(),
        eventId,
        title: input.title ?? null,
        message: input.message,
        type: input.type ?? 'RUNNING_TEXT',
        priority: input.priority ?? 0,
        startsAt: input.startsAt ? new Date(input.startsAt) : null,
        endsAt: input.endsAt ? new Date(input.endsAt) : null,
        isActive: input.isActive ?? true,
      },
    })
  },

  async update(organizationId: string, id: string, input: Partial<AnnouncementInput>) {
    await this.getById(organizationId, id)
    return prisma.announcement.update({
      where: { id },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.message !== undefined ? { message: input.message } : {}),
        ...(input.type !== undefined ? { type: input.type } : {}),
        ...(input.priority !== undefined ? { priority: input.priority } : {}),
        ...(input.startsAt !== undefined ? { startsAt: input.startsAt ? new Date(input.startsAt) : null } : {}),
        ...(input.endsAt !== undefined ? { endsAt: input.endsAt ? new Date(input.endsAt) : null } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
    })
  },

  async remove(organizationId: string, id: string) {
    const announcement = await this.getById(organizationId, id)
    await prisma.announcement.delete({ where: { id } })
    return announcement
  },
}
