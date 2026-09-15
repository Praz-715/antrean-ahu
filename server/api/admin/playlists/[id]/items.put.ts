import { z } from 'zod'
import { defineApiHandler } from '../../../../utils/handler'
import { ok } from '../../../../utils/response'
import { requireOrganization, requirePermission } from '../../../../utils/context'
import { playlistService } from '../../../../services/media.service'
import { auditAsync, AUDIT_ACTIONS } from '../../../../utils/audit'
import { idSchema } from '../../../../../shared/schemas/common'
import { PERMISSIONS } from '../../../../../shared/constants/permissions'

const bodySchema = z.object({
  items: z.array(z.object({
    mediaId: idSchema,
    durationSeconds: z.number().int().min(1).max(3600).default(10),
  })).max(100),
})

export default defineApiHandler(async (event) => {
  const ctx = await requirePermission(event, PERMISSIONS.MEDIA_MANAGE)
  const organizationId = requireOrganization(ctx)
  const id = getRouterParam(event, 'id') as string
  const { items } = bodySchema.parse(await readBody(event))

  const playlist = await playlistService.replaceItems(organizationId, id, items)
  auditAsync(event, {
    organizationId,
    userId: ctx.userId,
    action: AUDIT_ACTIONS.PLAYLIST_UPDATED,
    entity: 'Playlist',
    entityId: id,
    newData: { itemCount: items.length },
  })

  return ok(playlist, 'Playlist disimpan')
})
