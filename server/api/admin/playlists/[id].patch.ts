import { z } from 'zod'
import { defineApiHandler } from '../../../utils/handler'
import { ok } from '../../../utils/response'
import { requireOrganization, requirePermission } from '../../../utils/context'
import { playlistService } from '../../../services/media.service'
import { PERMISSIONS } from '../../../../shared/constants/permissions'

const bodySchema = z.object({
  name: z.string().trim().min(2).max(150).optional(),
  isActive: z.boolean().optional(),
})

export default defineApiHandler(async (event) => {
  const ctx = await requirePermission(event, PERMISSIONS.MEDIA_MANAGE)
  const id = getRouterParam(event, 'id') as string
  const input = bodySchema.parse(await readBody(event))
  return ok(await playlistService.update(requireOrganization(ctx), id, input), 'Playlist diperbarui')
})
