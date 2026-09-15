import { z } from 'zod'
import { defineApiHandler } from '../../../utils/handler'
import { ok } from '../../../utils/response'
import { requireOrganization, requirePermission } from '../../../utils/context'
import { mediaService } from '../../../services/media.service'
import { PERMISSIONS } from '../../../../shared/constants/permissions'

const bodySchema = z.object({ name: z.string().trim().min(1, 'Nama wajib diisi').max(190) })

export default defineApiHandler(async (event) => {
  const ctx = await requirePermission(event, PERMISSIONS.MEDIA_MANAGE)
  const id = getRouterParam(event, 'id') as string
  const { name } = bodySchema.parse(await readBody(event))
  return ok(await mediaService.rename(requireOrganization(ctx), id, name), 'Nama media diperbarui')
})
