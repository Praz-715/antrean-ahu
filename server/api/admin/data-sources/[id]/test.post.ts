import { defineApiHandler } from '../../../../utils/handler'
import { ok } from '../../../../utils/response'
import { requireOrganization, requirePermission } from '../../../../utils/context'
import { datasourceService } from '../../../../services/datasource.service'
import { auditAsync, AUDIT_ACTIONS } from '../../../../utils/audit'
import { testDataSourceSchema } from '../../../../../shared/schemas/data-source'
import { rateLimit } from '../../../../utils/rate-limit'
import { PERMISSIONS } from '../../../../../shared/constants/permissions'

/**
 * Uji koneksi sumber data (§6).
 *
 * Tetap dibatasi lajunya walau ini jalur admin: tombolnya memicu permintaan keluar,
 * dan tombol yang bisa ditekan tanpa henti adalah alat pengganggu host lain.
 */
export default defineApiHandler(async (event) => {
  const ctx = await requirePermission(event, PERMISSIONS.INTEGRATION_MANAGE)
  const organizationId = requireOrganization(ctx)
  rateLimit(event, 'admin:datasource-test', 20)

  const id = getRouterParam(event, 'id') as string
  const { lookup } = testDataSourceSchema.parse(await readBody(event))

  const result = await datasourceService.test(organizationId, id, lookup)

  auditAsync(event, {
    organizationId,
    userId: ctx.userId,
    action: AUDIT_ACTIONS.DATA_SOURCE_TESTED,
    entity: 'DataSource',
    entityId: id,
    newData: { ok: result.ok, status: result.status, durationMs: result.durationMs },
  })

  return ok(result, result.ok ? 'Koneksi berhasil' : 'Koneksi gagal')
})
