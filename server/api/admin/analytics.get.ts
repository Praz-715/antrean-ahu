import { z } from 'zod'
import { defineApiHandler } from '../../utils/handler'
import { ok } from '../../utils/response'
import { requireOrganization, requirePermission } from '../../utils/context'
import { analyticsService } from '../../services/analytics.service'
import { dateSchema, idSchema } from '../../../shared/schemas/common'
import { PERMISSIONS } from '../../../shared/constants/permissions'

const querySchema = z.object({
  eventId: idSchema,
  from: dateSchema.optional(),
  to: dateSchema.optional(),
  queueTypeId: idSchema.optional(),
  operatorId: idSchema.optional(),
})

export default defineApiHandler(async (event) => {
  const ctx = await requirePermission(event, PERMISSIONS.ANALYTICS_VIEW, PERMISSIONS.REPORT_VIEW)
  const { queueTypeId, ...filter } = querySchema.parse(getQuery(event))

  /*
   * Halaman Analitik menyaring satu jenis antrean, Pusat Ekspor beberapa. Bentuk
   * kuerinya dibiarkan tunggal supaya tautan yang sudah beredar tetap berlaku;
   * yang jamak hanya dipakai di dalam service.
   */
  return ok(await analyticsService.overview(requireOrganization(ctx), {
    ...filter,
    ...(queueTypeId ? { queueTypeIds: [queueTypeId] } : {}),
  }))
})
