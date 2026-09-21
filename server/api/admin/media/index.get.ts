import { z } from 'zod'
import { defineApiHandler } from '../../../utils/handler'
import { ok } from '../../../utils/response'
import { requireOrganization, requirePermission } from '../../../utils/context'
import { mediaService } from '../../../services/media.service'
import { PERMISSIONS } from '../../../../shared/constants/permissions'

const querySchema = z.object({
  type: z.enum(['IMAGE', 'VIDEO', 'AUDIO']).optional(),
search: z.string().trim().max(120).optional(),
  /**
   * Sertakan daftar pemakai tiap berkas.
   *
   * Hanya pustaka media yang membutuhkannya; pemilih berkas di halaman lain
   * cukup nama dan URL, dan pemindaiannya menyentuh delapan tabel.
   */
  usages: z.coerce.boolean().default(false),
})

export default defineApiHandler(async (event) => {
  const ctx = await requirePermission(event, PERMISSIONS.MEDIA_VIEW)
  const params = querySchema.parse(getQuery(event))
  return ok(await mediaService.list(requireOrganization(ctx), params))
})
