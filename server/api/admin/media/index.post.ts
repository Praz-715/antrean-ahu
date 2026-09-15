import { defineApiHandler } from '../../../utils/handler'
import { errors, ok } from '../../../utils/response'
import { requireOrganization, requirePermission } from '../../../utils/context'
import { mediaService } from '../../../services/media.service'
import { auditAsync, AUDIT_ACTIONS } from '../../../utils/audit'
import { PERMISSIONS } from '../../../../shared/constants/permissions'

/** Unggah satu berkas media (multipart/form-data). */
export default defineApiHandler(async (event) => {
  const ctx = await requirePermission(event, PERMISSIONS.MEDIA_MANAGE)
  const organizationId = requireOrganization(ctx)

  const parts = await readMultipartFormData(event)
  if (!parts?.length) throw errors.validation('Tidak ada berkas yang dikirim')

  const file = parts.find(p => p.name === 'file' && p.filename)
  if (!file?.data?.length) throw errors.validation('Berkas tidak ditemukan pada kolom "file"')

  const field = (name: string) => parts.find(p => p.name === name && !p.filename)?.data.toString('utf8')
  const durationRaw = field('durationSeconds')

  const media = await mediaService.upload({
    organizationId,
    uploadedById: ctx.userId,
    buffer: file.data,
    filename: file.filename ?? 'media',
    name: field('name'),
    durationSeconds: durationRaw ? Number(durationRaw) : undefined,
  })

  auditAsync(event, {
    organizationId,
    userId: ctx.userId,
    action: AUDIT_ACTIONS.MEDIA_UPLOADED,
    entity: 'Media',
    entityId: media.id,
    newData: { name: media.name, type: media.type, sizeBytes: media.sizeBytes },
  })

  setResponseStatus(event, 201)
  return ok(media, 'Media diunggah')
})
