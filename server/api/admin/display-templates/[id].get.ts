import { defineApiHandler } from '../../../utils/handler'
import { ok } from '../../../utils/response'
import { requireOrganization, requirePermission } from '../../../utils/context'
import { displayTemplateService } from '../../../services/display-template.service'
import { PERMISSIONS } from '../../../../shared/constants/permissions'

export default defineApiHandler(async (event) => {
  const ctx = await requirePermission(event, PERMISSIONS.DISPLAY_VIEW)
  const id = getRouterParam(event, 'id') as string
  return ok(await displayTemplateService.getById(requireOrganization(ctx), id))
})
