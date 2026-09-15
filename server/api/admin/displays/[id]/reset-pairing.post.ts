import { defineApiHandler } from '../../../../utils/handler'
import { ok } from '../../../../utils/response'
import { requireOrganization, requirePermission } from '../../../../utils/context'
import { displayService } from '../../../../services/display.service'
import { emitDisplayReload } from '../../../../realtime/emitters'
import { PERMISSIONS } from '../../../../../shared/constants/permissions'

export default defineApiHandler(async (event) => {
  const ctx = await requirePermission(event, PERMISSIONS.DISPLAY_MANAGE)
  const id = getRouterParam(event, 'id') as string
  const device = await displayService.resetPairing(requireOrganization(ctx), id)
  emitDisplayReload(device.id)
  return ok(device, 'Pairing direset. Buka ulang halaman display untuk memasangkan kembali.')
})
