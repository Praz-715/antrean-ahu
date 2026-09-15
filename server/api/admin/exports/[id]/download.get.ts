import { requireOrganization, requirePermission } from '../../../../utils/context'
import { exportService } from '../../../../services/export.service'
import { toErrorResponse } from '../../../../utils/handler'
import { PERMISSIONS } from '../../../../../shared/constants/permissions'

/** Unduh hasil ekspor. Mengembalikan berkas, bukan amplop JSON. */
export default defineEventHandler(async (event) => {
  try {
    const ctx = await requirePermission(event, PERMISSIONS.REPORT_EXPORT, PERMISSIONS.REPORT_VIEW)
    const id = getRouterParam(event, 'id') as string

    const { stream, filename, mime } = await exportService.download(requireOrganization(ctx), id)

    setResponseHeader(event, 'Content-Type', mime)
    setResponseHeader(event, 'Content-Disposition', `attachment; filename="${filename}"`)
    setResponseHeader(event, 'Cache-Control', 'no-store')

    return sendStream(event, stream)
  }
  catch (error) {
    return toErrorResponse(event, error)
  }
})
