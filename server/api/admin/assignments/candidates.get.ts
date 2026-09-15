import { z } from 'zod'
import { defineApiHandler } from '../../../utils/handler'
import { ok } from '../../../utils/response'
import { requireOrganization, requirePermission } from '../../../utils/context'
import { assignmentService } from '../../../services/user.service'
import { idSchema } from '../../../../shared/schemas/common'
import { PERMISSIONS } from '../../../../shared/constants/permissions'

/**
 * Calon operator untuk satu event beserta keterangan keterikatannya (§28).
 * Halaman penugasan memakainya agar admin melihat siapa yang masih bebas
 * sebelum menyimpan, bukan setelah ditolak.
 */
export default defineApiHandler(async (event) => {
  const ctx = await requirePermission(event, PERMISSIONS.ASSIGNMENT_MANAGE, PERMISSIONS.USER_VIEW)
  const { eventId } = z.object({ eventId: idSchema }).parse(getQuery(event))
  return ok(await assignmentService.candidates(requireOrganization(ctx), eventId))
})
