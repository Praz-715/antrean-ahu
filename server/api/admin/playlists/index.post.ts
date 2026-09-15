import { z } from 'zod'
import { defineApiHandler } from '../../../utils/handler'
import { ok } from '../../../utils/response'
import { requireOrganization, requirePermission } from '../../../utils/context'
import { playlistService } from '../../../services/media.service'
import { PERMISSIONS } from '../../../../shared/constants/permissions'

const bodySchema = z.object({ name: z.string().trim().min(2, 'Nama minimal 2 karakter').max(150) })

export default defineApiHandler(async (event) => {
  const ctx = await requirePermission(event, PERMISSIONS.MEDIA_MANAGE)
  const { name } = bodySchema.parse(await readBody(event))
  setResponseStatus(event, 201)
  return ok(await playlistService.create(requireOrganization(ctx), name), 'Playlist dibuat')
})
