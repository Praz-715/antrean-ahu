import { z } from 'zod'
import { requireOrganization, requirePermission } from '../../../../utils/context'
import { publishService } from '../../../../services/publish.service'
import { toErrorResponse } from '../../../../utils/handler'
import { PERMISSIONS } from '../../../../../shared/constants/permissions'

const querySchema = z.object({
  format: z.enum(['png', 'svg']).default('png'),
  size: z.coerce.number().int().min(120).max(2000).default(600),
  download: z.coerce.boolean().default(false),
})

/** Unduh / tampilkan QR. Mengembalikan berkas gambar, bukan amplop JSON. */
export default defineEventHandler(async (event) => {
  try {
    const ctx = await requirePermission(event, PERMISSIONS.PUBLIC_PAGE_VIEW)
    const id = getRouterParam(event, 'id') as string
    const { format, size, download } = querySchema.parse(getQuery(event))

    const { body, mime } = await publishService.renderQr(requireOrganization(ctx), id, format, size)

    setResponseHeader(event, 'Content-Type', mime)
    setResponseHeader(event, 'Cache-Control', 'no-store')
    if (download) {
      setResponseHeader(event, 'Content-Disposition', `attachment; filename="qr-antrean.${format}"`)
    }
    return body
  }
  catch (error) {
    return toErrorResponse(event, error)
  }
})
