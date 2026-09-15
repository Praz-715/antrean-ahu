import { z } from 'zod'
import { defineApiHandler } from '../../../../utils/handler'
import { ok } from '../../../../utils/response'
import { requireOrganization, requirePermission } from '../../../../utils/context'
import { formService } from '../../../../services/form.service'
import { auditAsync, AUDIT_ACTIONS } from '../../../../utils/audit'
import { PERMISSIONS } from '../../../../../shared/constants/permissions'

const FIELD_TYPES = [
  'TEXT', 'TEXTAREA', 'NUMBER', 'PHONE', 'EMAIL', 'DATE', 'DATETIME',
  'SELECT', 'RADIO', 'CHECKBOX', 'FILE', 'HIDDEN',
] as const

const fieldSchema = z.object({
  key: z.string().trim().min(1).max(60),
  label: z.string().trim().min(1, 'Label wajib diisi').max(150),
  type: z.enum(FIELD_TYPES),
  placeholder: z.string().trim().max(190).optional().nullable(),
  helpText: z.string().trim().max(255).optional().nullable(),
  isRequired: z.boolean().default(false),
  defaultValue: z.string().trim().max(255).optional().nullable(),
  options: z.array(z.object({ label: z.string().min(1), value: z.string().min(1) })).optional().nullable(),
  validation: z.record(z.string(), z.unknown()).optional().nullable(),
  visibility: z.record(z.string(), z.unknown()).optional().nullable(),
  autofillKey: z.string().trim().max(60).optional().nullable(),
})

const bodySchema = z.object({ fields: z.array(fieldSchema).max(50) })

/** Simpan seluruh susunan field formulir sekaligus (form builder). */
export default defineApiHandler(async (event) => {
  const ctx = await requirePermission(event, PERMISSIONS.FORM_MANAGE)
  const organizationId = requireOrganization(ctx)
  const id = getRouterParam(event, 'id') as string
  const { fields } = bodySchema.parse(await readBody(event))

  const form = await formService.replaceFields(organizationId, id, fields)

  auditAsync(event, {
    organizationId,
    userId: ctx.userId,
    action: AUDIT_ACTIONS.FORM_UPDATED,
    entity: 'FormDefinition',
    entityId: id,
    newData: { fieldCount: fields.length, keys: fields.map(f => f.key) },
  })

  return ok(form, 'Formulir disimpan')
})
