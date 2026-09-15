import { z } from 'zod'
import { defineApiHandler } from '../../../utils/handler'
import { ok } from '../../../utils/response'
import { requireOrganization, requirePermission } from '../../../utils/context'
import { announcementService } from '../../../services/announcement.service'
import { emitAnnouncement } from '../../../realtime/emitters'
import { PERMISSIONS } from '../../../../shared/constants/permissions'

const bodySchema = z.object({
  title: z.string().trim().max(190).optional().nullable(),
  message: z.string().trim().min(1).max(2000).optional(),
  type: z.enum(['TEXT', 'RUNNING_TEXT']).optional(),
  priority: z.number().int().min(0).max(100).optional(),
  startsAt: z.string().optional().nullable(),
  endsAt: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
})

export default defineApiHandler(async (event) => {
  const ctx = await requirePermission(event, PERMISSIONS.ANNOUNCEMENT_MANAGE)
  const id = getRouterParam(event, 'id') as string
  const input = bodySchema.parse(await readBody(event))

  const announcement = await announcementService.update(requireOrganization(ctx), id, input)
  emitAnnouncement(announcement.eventId, announcement)

  return ok(announcement, 'Pengumuman diperbarui')
})
