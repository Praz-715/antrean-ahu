import { z } from 'zod'
import { defineApiHandler } from '../../../utils/handler'
import { ok } from '../../../utils/response'
import { requireOrganization, requirePermission } from '../../../utils/context'
import { organizationService } from '../../../services/organization.service'
import { auditAsync, AUDIT_ACTIONS } from '../../../utils/audit'
import { PERMISSIONS } from '../../../../shared/constants/permissions'

/**
 * Ganti identitas organisasi.
 *
 * Namanya muncul di header panel admin, halaman publik, layar display, tiket cetak,
 * dan kop laporan — jadi perubahannya dicatat di audit log seperti perubahan
 * pengaturan sistem lainnya.
 */
const bodySchema = z.object({
  name: z.string().trim().min(2, 'Nama organisasi minimal 2 karakter').max(150).optional(),
  logoUrl: z.string().trim().max(500).optional().nullable(),
})

export default defineApiHandler(async (event) => {
  const ctx = await requirePermission(event, PERMISSIONS.SETTING_MANAGE)
  const organizationId = requireOrganization(ctx)
  const input = bodySchema.parse(await readBody(event))

  const before = await organizationService.get(organizationId)
  const saved = await organizationService.update(organizationId, input)

  auditAsync(event, {
    organizationId,
    userId: ctx.userId,
    action: AUDIT_ACTIONS.ORGANIZATION_UPDATED,
    entity: 'Organization',
    entityId: organizationId,
    oldData: { name: before.name, logoUrl: before.logoUrl },
    newData: { name: saved.name, logoUrl: saved.logoUrl },
  })

  return ok(saved, 'Identitas organisasi disimpan')
})
