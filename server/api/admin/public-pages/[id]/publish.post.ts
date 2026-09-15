import { z } from 'zod'
import { defineApiHandler } from '../../../../utils/handler'
import { ok } from '../../../../utils/response'
import { requireOrganization, requirePermission } from '../../../../utils/context'
import { publishService } from '../../../../services/publish.service'
import { auditAsync, AUDIT_ACTIONS } from '../../../../utils/audit'
import { PERMISSIONS } from '../../../../../shared/constants/permissions'

const bodySchema = z.object({ isPublished: z.boolean() })

export default defineApiHandler(async (event) => {
  const ctx = await requirePermission(event, PERMISSIONS.PUBLIC_PAGE_PUBLISH)
  const organizationId = requireOrganization(ctx)
  const id = getRouterParam(event, 'id') as string
  const { isPublished } = bodySchema.parse(await readBody(event))

  const page = await publishService.setPublished(organizationId, id, isPublished)
  auditAsync(event, {
    organizationId,
    userId: ctx.userId,
    action: isPublished ? AUDIT_ACTIONS.PUBLIC_PAGE_PUBLISHED : AUDIT_ACTIONS.PUBLIC_PAGE_UNPUBLISHED,
    entity: 'PublicPage',
    entityId: id,
    newData: { isPublished, url: page.url },
  })

  return ok(page, isPublished ? 'Halaman dipublikasikan' : 'Publikasi dihentikan')
})
