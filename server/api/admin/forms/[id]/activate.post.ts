import { defineApiHandler } from '../../../../utils/handler'
import { ok } from '../../../../utils/response'
import { requireOrganization, requirePermission } from '../../../../utils/context'
import { formService } from '../../../../services/form.service'
import { PERMISSIONS } from '../../../../../shared/constants/permissions'

export default defineApiHandler(async (event) => {
  const ctx = await requirePermission(event, PERMISSIONS.FORM_MANAGE)
  const id = getRouterParam(event, 'id') as string
  return ok(await formService.activate(requireOrganization(ctx), id), 'Formulir diaktifkan')
})
