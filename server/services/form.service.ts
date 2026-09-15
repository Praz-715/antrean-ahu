import type { FormFieldType } from '../../generated/prisma/enums'
import { prisma } from '../utils/prisma'
import { errors } from '../utils/response'
import { ERROR_CODES } from '../../shared/constants/errors'
import { newId } from '../utils/id'

export interface FormFieldInput {
  id?: string
  key: string
  label: string
  type: FormFieldType
  placeholder?: string | null
  helpText?: string | null
  isRequired?: boolean
  defaultValue?: string | null
  options?: Array<{ label: string, value: string }> | null
  validation?: Record<string, unknown> | null
  visibility?: Record<string, unknown> | null
  autofillKey?: string | null
}

export const formService = {
  async list(organizationId: string, eventId: string) {
    await assertEvent(organizationId, eventId)
    return prisma.formDefinition.findMany({
      where: { eventId },
      orderBy: { createdAt: 'desc' },
      include: {
        fields: { orderBy: { displayOrder: 'asc' } },
        _count: { select: { fields: true } },
      },
    })
  },

  async getById(organizationId: string, id: string) {
    const form = await prisma.formDefinition.findFirst({
      where: { id, event: { organizationId, deletedAt: null } },
      include: {
        fields: { orderBy: { displayOrder: 'asc' } },
        dataSource: { select: { id: true, name: true, isActive: true } },
      },
    })
    if (!form) throw errors.notFound('Formulir tidak ditemukan')
    return form
  },

  async create(organizationId: string, input: { eventId: string, name: string, description?: string | null }) {
    await assertEvent(organizationId, input.eventId)

    const form = await prisma.formDefinition.create({
      data: {
        id: newId(),
        eventId: input.eventId,
        name: input.name,
        description: input.description ?? null,
        isActive: false,
      },
    })

    return this.getById(organizationId, form.id)
  },

  async update(
    organizationId: string,
    id: string,
    input: { name?: string, description?: string | null, dataSourceId?: string | null, requireCaptcha?: boolean },
  ) {
    await this.getById(organizationId, id)

    // Sumber data wajib milik organisasi yang sama — jangan sampai satu formulir
    // menarik data lewat integrasi milik organisasi lain.
    if (input.dataSourceId) {
      const source = await prisma.dataSource.findFirst({
        where: { id: input.dataSourceId, organizationId, deletedAt: null },
        select: { id: true },
      })
      if (!source) throw errors.notFound('Sumber data tidak ditemukan')
    }

    await prisma.formDefinition.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.dataSourceId !== undefined ? { dataSourceId: input.dataSourceId } : {}),
        ...(input.requireCaptcha !== undefined ? { requireCaptcha: input.requireCaptcha } : {}),
      },
    })
    return this.getById(organizationId, id)
  },

  /** Hanya satu formulir aktif per event — halaman publik selalu jelas memakai yang mana. */
  async activate(organizationId: string, id: string) {
    const form = await this.getById(organizationId, id)
    await prisma.$transaction([
      prisma.formDefinition.updateMany({ where: { eventId: form.eventId }, data: { isActive: false } }),
      prisma.formDefinition.update({ where: { id }, data: { isActive: true } }),
    ])
    return this.getById(organizationId, id)
  },

  /**
   * Simpan seluruh susunan field sekaligus (§5).
   * Field yang sudah pernah dipakai visitor tidak dihapus permanen begitu saja —
   * `visitor_field_values` menyimpan `fieldKey` sehingga riwayat tetap terbaca.
   */
  async replaceFields(organizationId: string, id: string, fields: FormFieldInput[]) {
    const form = await this.getById(organizationId, id)

    const keys = fields.map(f => f.key)
    const duplicates = keys.filter((k, i) => keys.indexOf(k) !== i)
    if (duplicates.length) {
      throw errors.conflict(ERROR_CODES.CONFLICT, `Key field duplikat: ${[...new Set(duplicates)].join(', ')}`)
    }

    for (const field of fields) {
      if (!/^[a-z][a-z0-9_]*$/.test(field.key)) {
        throw errors.validation(`Key "${field.key}" harus huruf kecil, angka, dan garis bawah, diawali huruf`)
      }
      if (['SELECT', 'RADIO', 'CHECKBOX'].includes(field.type) && !(field.options?.length)) {
        throw errors.validation(`Field "${field.label}" bertipe pilihan wajib punya minimal satu opsi`)
      }
    }

    await prisma.$transaction(async (tx) => {
      const existing = await tx.formField.findMany({ where: { formDefinitionId: id }, select: { id: true, key: true } })
      const keepKeys = new Set(keys)

      const removable = existing.filter(e => !keepKeys.has(e.key))
      if (removable.length) {
        // lepaskan tautan dari jawaban lama agar riwayat tidak ikut terhapus
        await tx.visitorFieldValue.updateMany({
          where: { formFieldId: { in: removable.map(r => r.id) } },
          data: { formFieldId: null },
        })
        await tx.formField.deleteMany({ where: { id: { in: removable.map(r => r.id) } } })
      }

      for (const [index, field] of fields.entries()) {
        const data = {
          label: field.label,
          type: field.type,
          placeholder: field.placeholder ?? null,
          helpText: field.helpText ?? null,
          isRequired: field.isRequired ?? false,
          defaultValue: field.defaultValue ?? null,
          options: (field.options ?? undefined) as never,
          validation: (field.validation ?? undefined) as never,
          visibility: (field.visibility ?? undefined) as never,
          autofillKey: field.autofillKey ?? null,
          displayOrder: index + 1,
        }

        const current = existing.find(e => e.key === field.key)
        if (current) {
          await tx.formField.update({ where: { id: current.id }, data })
        }
        else {
          await tx.formField.create({
            data: { id: newId(), formDefinitionId: id, key: field.key, ...data },
          })
        }
      }
    }, { timeout: 20_000 })

    void form
    return this.getById(organizationId, id)
  },

  async remove(organizationId: string, id: string) {
    const form = await this.getById(organizationId, id)
    if (form.isActive) {
      throw errors.conflict(ERROR_CODES.CONFLICT, 'Formulir aktif tidak dapat dihapus. Aktifkan formulir lain dahulu.')
    }
    await prisma.formDefinition.delete({ where: { id } })
    return form
  },
}

async function assertEvent(organizationId: string, eventId: string) {
  const event = await prisma.event.findFirst({
    where: { id: eventId, organizationId, deletedAt: null },
    select: { id: true },
  })
  if (!event) throw errors.notFound('Event tidak ditemukan')
  return event
}
