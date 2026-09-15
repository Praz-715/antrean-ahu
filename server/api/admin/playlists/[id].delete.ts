import { defineApiHandler } from '../../../utils/handler'
import { ok } from '../../../utils/response'
import { requireOrganization, requirePermission } from '../../../utils/context'
import { playlistService } from '../../../services/media.service'
import { PERMISSIONS } from '../../../../shared/constants/permissions'

export default defineApiHandler(async (event) => {
  const ctx = await requirePermission(event, PERMISSIONS.MEDIA_MANAGE)
  const id = getRouterParam(event, 'id') as string
  await playlistService.remove(requireOrganization(ctx), id)
  return ok({ id }, 'Playlist dihapus')
})
