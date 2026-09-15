import { z } from 'zod'
import type { FormFieldModel } from '../../generated/prisma/models'

export interface FieldOption { label: string, value: string }

export interface FieldValidation {
  minLength?: number
  maxLength?: number
  min?: number
  max?: number
  pattern?: string
  patternMessage?: string
}

function optionValues(field: Pick<FormFieldModel, 'options'>): string[] {
  const raw = field.options as unknown
  if (!Array.isArray(raw)) return []
  return raw
    .map((o) => {
      if (typeof o === 'string') return o
      if (o && typeof o === 'object' && 'value' in o) return String((o as FieldOption).value)
      return null
    })
    .filter((v): v is string => !!v)
}

/**
 * Bangun validator Zod dari definisi form yang dibuat admin (§5).
 * Satu sumber aturan: dipakai server saat submit; klien memakai definisi yang sama
 * untuk merender input dan pesan error.
 */
export function buildFormValidator(fields: Array<Pick<FormFieldModel, 'key' | 'type' | 'isRequired' | 'label' | 'validation' | 'options'>>) {
  const shape: Record<string, z.ZodTypeAny> = {}

  for (const field of fields) {
    const rules = (field.validation ?? {}) as FieldValidation
    const label = field.label
    let schema: z.ZodTypeAny

    switch (field.type) {
      case 'NUMBER': {
        let n = z.coerce.number({ message: `${label} harus berupa angka` })
        if (rules.min !== undefined) n = n.min(rules.min, `${label} minimal ${rules.min}`)
        if (rules.max !== undefined) n = n.max(rules.max, `${label} maksimal ${rules.max}`)
        schema = n
        break
      }
      case 'EMAIL':
        schema = z.string().trim().email(`${label} tidak valid`)
        break
      case 'PHONE':
        schema = z
          .string()
          .trim()
          .regex(/^[0-9+][0-9\-\s()]{5,19}$/, `${label} tidak valid`)
        break
      case 'DATE':
        schema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, `${label} harus berformat tanggal`)
        break
      case 'DATETIME':
        schema = z.string().min(1, `${label} wajib diisi`)
        break
      case 'SELECT':
      case 'RADIO': {
        const values = optionValues(field)
        schema = values.length
          ? z.string().refine(v => values.includes(v), { message: `${label} tidak valid` })
          : z.string()
        break
      }
      case 'CHECKBOX': {
        const values = optionValues(field)
        schema = values.length
          ? z.array(z.string().refine(v => values.includes(v), { message: `${label} tidak valid` }))
          : z.boolean()
        break
      }
      case 'FILE':
        schema = z.string().max(500)
        break
      default: {
        let s = z.string().trim()
        if (rules.minLength) s = s.min(rules.minLength, `${label} minimal ${rules.minLength} karakter`)
        if (rules.maxLength) s = s.max(rules.maxLength, `${label} maksimal ${rules.maxLength} karakter`)
        else s = s.max(2000, `${label} terlalu panjang`)
        if (rules.pattern) {
          try {
            s = s.regex(new RegExp(rules.pattern), rules.patternMessage ?? `${label} tidak sesuai format`)
          }
          catch { /* pola tidak valid diabaikan, jangan sampai menggagalkan submit */ }
        }
        schema = s
      }
    }

    if (field.isRequired) {
      if (schema instanceof z.ZodString) {
        schema = schema.min(1, `${label} wajib diisi`)
      }
      else if (schema instanceof z.ZodArray) {
        schema = schema.min(1, `${label} wajib dipilih`)
      }
    }
    else {
      schema = schema.optional().nullable()
    }

    shape[field.key] = schema
  }

  return z.object(shape).strip()
}

/** Ambil kolom visitor inti dari jawaban form supaya bisa dicari & dilaporkan. */
export function extractVisitorCore(values: Record<string, unknown>) {
  const pick = (...keys: string[]) => {
    for (const key of keys) {
      const v = values[key]
      if (typeof v === 'string' && v.trim()) return v.trim()
    }
    return null
  }

  return {
    fullName: pick('full_name', 'fullname', 'nama', 'nama_lengkap', 'name'),
    phone: pick('phone', 'no_hp', 'nomor_hp', 'telepon', 'hp', 'whatsapp'),
    email: pick('email', 'surel'),
    identityNumber: pick('identity_number', 'nik', 'no_identitas', 'nomor_identitas', 'medical_record_number', 'no_rm'),
  }
}
