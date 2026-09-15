import { prisma } from '../utils/prisma'
import { errors } from '../utils/response'
import { ERROR_CODES } from '../../shared/constants/errors'
import { newId } from '../utils/id'
import type { WidgetType } from '../../shared/constants/widgets'

export interface WidgetInput {
  type: WidgetType
  x: number
  y: number
  width: number
  height: number
  zIndex: number
  config?: Record<string, unknown> | null
  style?: Record<string, unknown> | null
  animation?: string | null
  isVisible?: boolean
  mediaId?: string | null
  playlistId?: string | null
}

/** Template tata letak layar yang disusun admin tanpa menulis kode (§19). */
export const displayTemplateService = {
  async list(organizationId: string, eventId?: string) {
    return prisma.displayTemplate.findMany({
      where: {
        organizationId,
        deletedAt: null,
        ...(eventId ? { OR: [{ eventId }, { eventId: null }] } : {}),
      },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { widgets: true, devices: true } },
        event: { select: { id: true, name: true } },
      },
    })
  },

  async getById(organizationId: string, id: string) {
    const template = await prisma.displayTemplate.findFirst({
      where: { id, organizationId, deletedAt: null },
      include: {
        widgets: { orderBy: { zIndex: 'asc' } },
        event: { select: { id: true, name: true } },
        devices: { where: { deletedAt: null }, select: { id: true, name: true, deviceCode: true } },
      },
    })
    if (!template) throw errors.notFound('Template display tidak ditemukan')
    return template
  },

  async create(organizationId: string, input: {
    name: string
    type: 'GLOBAL' | 'QUEUE_TYPE'
    eventId?: string | null
    background?: Record<string, unknown> | null
  }) {
    if (input.eventId) {
      const event = await prisma.event.findFirst({
        where: { id: input.eventId, organizationId, deletedAt: null },
        select: { id: true },
      })
      if (!event) throw errors.notFound('Event tidak ditemukan')
    }

    const template = await prisma.displayTemplate.create({
      data: {
        id: newId(),
        organizationId,
        eventId: input.eventId ?? null,
        name: input.name,
        type: input.type,
        canvasWidth: 1920,
        canvasHeight: 1080,
        background: (input.background ?? { color: '#020617' }) as never,
      },
    })

    return this.getById(organizationId, template.id)
  },

  async update(organizationId: string, id: string, input: {
    name?: string
    eventId?: string | null
    background?: Record<string, unknown> | null
    settings?: Record<string, unknown> | null
    isDefault?: boolean
  }) {
    const template = await this.getById(organizationId, id)

    // hanya satu template bawaan per tipe, supaya display baru tidak ambigu
    if (input.isDefault) {
      await prisma.displayTemplate.updateMany({
        where: { organizationId, type: template.type, id: { not: id } },
        data: { isDefault: false },
      })
    }

    await prisma.displayTemplate.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.eventId !== undefined ? { eventId: input.eventId } : {}),
        ...(input.background !== undefined ? { background: input.background as never } : {}),
        ...(input.settings !== undefined ? { settings: input.settings as never } : {}),
        ...(input.isDefault !== undefined ? { isDefault: input.isDefault } : {}),
      },
    })

    return this.getById(organizationId, id)
  },

  /**
   * Simpan seluruh susunan widget sekaligus.
   * Builder mengirim keadaan kanvas apa adanya, jadi tidak perlu melacak widget
   * mana yang ditambah/dihapus satu per satu.
   */
  async replaceWidgets(organizationId: string, id: string, widgets: WidgetInput[]) {
    await this.getById(organizationId, id)

    const mediaIds = [...new Set(widgets.map(w => w.mediaId).filter(Boolean) as string[])]
    const playlistIds = [...new Set(widgets.map(w => w.playlistId).filter(Boolean) as string[])]

    if (mediaIds.length) {
      const owned = await prisma.media.count({ where: { id: { in: mediaIds }, organizationId, deletedAt: null } })
      if (owned !== mediaIds.length) throw errors.notFound('Ada media yang tidak ditemukan pada organisasi ini')
    }
    if (playlistIds.length) {
      const owned = await prisma.playlist.count({ where: { id: { in: playlistIds }, organizationId } })
      if (owned !== playlistIds.length) throw errors.notFound('Ada playlist yang tidak ditemukan pada organisasi ini')
    }

    await prisma.$transaction(async (tx) => {
      await tx.displayWidget.deleteMany({ where: { templateId: id } })
      if (widgets.length) {
        await tx.displayWidget.createMany({
          data: widgets.map((w, index) => ({
            id: newId(),
            templateId: id,
            type: w.type,
            x: Math.round(w.x),
            y: Math.round(w.y),
            width: Math.max(20, Math.round(w.width)),
            height: Math.max(20, Math.round(w.height)),
            zIndex: w.zIndex ?? index + 1,
            config: (w.config ?? undefined) as never,
            style: (w.style ?? undefined) as never,
            animation: w.animation ?? null,
            isVisible: w.isVisible ?? true,
            mediaId: w.mediaId ?? null,
            playlistId: w.playlistId ?? null,
          })),
        })
      }
    }, { timeout: 20_000 })

    return this.getById(organizationId, id)
  },

  /** Salin template beserta seluruh widget-nya — dasar untuk membuat variasi layar. */
  async duplicate(organizationId: string, id: string) {
    const source = await this.getById(organizationId, id)

    const copy = await prisma.displayTemplate.create({
      data: {
        id: newId(),
        organizationId,
        eventId: source.eventId,
        name: `${source.name} (salinan)`,
        type: source.type,
        canvasWidth: source.canvasWidth,
        canvasHeight: source.canvasHeight,
        background: (source.background ?? undefined) as never,
        settings: (source.settings ?? undefined) as never,
      },
    })

    if (source.widgets.length) {
      await prisma.displayWidget.createMany({
        data: source.widgets.map(w => ({
          id: newId(),
          templateId: copy.id,
          type: w.type,
          x: w.x,
          y: w.y,
          width: w.width,
          height: w.height,
          zIndex: w.zIndex,
          config: (w.config ?? undefined) as never,
          style: (w.style ?? undefined) as never,
          animation: w.animation,
          isVisible: w.isVisible,
          mediaId: w.mediaId,
          playlistId: w.playlistId,
        })),
      })
    }

    return this.getById(organizationId, copy.id)
  },

  async remove(organizationId: string, id: string) {
    const template = await this.getById(organizationId, id)

    if (template.devices.length) {
      throw errors.conflict(
        ERROR_CODES.CONFLICT,
        `Template masih dipakai ${template.devices.length} perangkat display`,
      )
    }

    await prisma.displayTemplate.delete({ where: { id } })
    return template
  },
}
