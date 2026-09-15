import { defineApiHandler } from '../../../utils/handler'
import { ok } from '../../../utils/response'
import { requireOrganization, requirePermission } from '../../../utils/context'
import { announcementService } from '../../../services/announcement.service'
import { emitAnnouncement } from '../../../realtime/emitters'
import { PERMISSIONS } from '../../../../shared/constants/permissions'

export default defineApiHandler(async (event) => {
  const ctx = await requirePermission(event, PERMISSIONS.ANNOUNCEMENT_MANAGE)
  const id = getRouterParam(event, 'id') as string

  const removed = await announcementService.remove(requireOrganization(ctx), id)
  emitAnnouncement(removed.eventId, { id: removed.id, deleted: true })

  return ok({ id }, 'Pengumuman dihapus')
})
