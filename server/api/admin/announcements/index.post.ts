import { z } from 'zod'
import { defineApiHandler } from '../../../utils/handler'
import { ok } from '../../../utils/response'
import { requireOrganization, requirePermission } from '../../../utils/context'
import { announcementService } from '../../../services/announcement.service'
import { emitAnnouncement } from '../../../realtime/emitters'
import { auditAsync, AUDIT_ACTIONS } from '../../../utils/audit'
import { idSchema } from '../../../../shared/schemas/common'
import { PERMISSIONS } from '../../../../shared/constants/permissions'

const bodySchema = z.object({
  eventId: idSchema,
  title: z.string().trim().max(190).optional().nullable(),
  message: z.string().trim().min(1, 'Pesan wajib diisi').max(2000),
  type: z.enum(['TEXT', 'RUNNING_TEXT']).default('RUNNING_TEXT'),
  priority: z.number().int().min(0).max(100).default(0),
  startsAt: z.string().optional().nullable(),
  endsAt: z.string().optional().nullable(),
  isActive: z.boolean().default(true),
})

export default defineApiHandler(async (event) => {
  const ctx = await requirePermission(event, PERMISSIONS.ANNOUNCEMENT_MANAGE)
  const organizationId = requireOrganization(ctx)
  const { eventId, ...input } = bodySchema.parse(await readBody(event))

  const announcement = await announcementService.create(organizationId, eventId, input)

  // Layar yang sedang menyala langsung memperbarui teks berjalannya.
  emitAnnouncement(eventId, announcement)

  auditAsync(event, {
    organizationId,
    userId: ctx.userId,
    action: AUDIT_ACTIONS.ANNOUNCEMENT_CREATED,
    entity: 'Announcement',
    entityId: announcement.id,
    newData: { message: announcement.message, type: announcement.type },
  })

  setResponseStatus(event, 201)
  return ok(announcement, 'Pengumuman dibuat')
})
