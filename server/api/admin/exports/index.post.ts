import { z } from 'zod'
import { defineApiHandler } from '../../../utils/handler'
import { ok } from '../../../utils/response'
import { requireOrganization, requirePermission } from '../../../utils/context'
import { exportService, EXPORT_TYPES } from '../../../services/export.service'
import { auditAsync, AUDIT_ACTIONS } from '../../../utils/audit'
import { dateSchema, idSchema } from '../../../../shared/schemas/common'
import { PERMISSIONS } from '../../../../shared/constants/permissions'

const bodySchema = z.object({
  type: z.enum(EXPORT_TYPES),
  format: z.enum(['CSV', 'XLSX']).default('CSV'),
  eventId: idSchema,
  from: dateSchema,
  to: dateSchema,
  queueTypeId: idSchema.optional(),
  status: z.string().max(20).optional(),
}).refine(v => v.from <= v.to, {
  message: 'Tanggal awal tidak boleh setelah tanggal akhir',
  path: ['from'],
})

/** Antrekan satu pekerjaan ekspor; pemrosesan berjalan di latar belakang (§38). */
export default defineApiHandler(async (event) => {
  const ctx = await requirePermission(event, PERMISSIONS.REPORT_EXPORT)
  const organizationId = requireOrganization(ctx)
  const { type, format, ...filters } = bodySchema.parse(await readBody(event))

  const job = await exportService.create(organizationId, ctx.userId, { type, format, filters })

  auditAsync(event, {
    organizationId,
    userId: ctx.userId,
    action: AUDIT_ACTIONS.EXPORT_REQUESTED,
    entity: 'ExportJob',
    entityId: job.id,
    newData: { type, format, filters },
  })

  setResponseStatus(event, 202)
  return ok(job, 'Ekspor sedang diproses')
})
