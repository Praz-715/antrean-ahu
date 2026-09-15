import { z } from 'zod'
import { hexColorSchema, idSchema } from './common'

export const createQueueTypeSchema = z.object({
  eventId: idSchema,
  code: z
    .string()
    .trim()
    .min(1, 'Kode wajib diisi')
    .max(20)
    .regex(/^[A-Za-z0-9_-]+$/, 'Kode hanya boleh huruf, angka, - dan _')
    .transform(v => v.toUpperCase()),
  name: z.string().trim().min(2, 'Nama minimal 2 karakter').max(120),
  description: z.string().trim().max(500).optional().nullable(),
  prefix: z.string().trim().min(1, 'Prefix wajib diisi').max(10),
  startingNumber: z.number().int().min(1).max(999999).default(1),
  numberFormat: z.string().trim().min(1).max(50).default('{prefix}{seq}'),
  padding: z.number().int().min(1).max(8).default(3),
  color: hexColorSchema.default('#1b5cf5'),
  icon: z.string().trim().max(60).optional().nullable(),
  isActive: z.boolean().default(true),
  displayOrder: z.number().int().min(0).max(999).default(0),
  maxWaiting: z.number().int().min(0).max(100000).optional().nullable(),
  estServiceSeconds: z.number().int().min(30).max(86400).default(480),
})

export const updateQueueTypeSchema = createQueueTypeSchema.omit({ eventId: true }).partial()

export const createCounterSchema = z.object({
  eventId: idSchema,
  code: z
    .string()
    .trim()
    .min(1, 'Kode wajib diisi')
    .max(20)
    .regex(/^[A-Za-z0-9_-]+$/, 'Kode hanya boleh huruf, angka, - dan _')
    .transform(v => v.toUpperCase()),
  name: z.string().trim().min(2, 'Nama minimal 2 karakter').max(120),
  isActive: z.boolean().default(true),
  displayOrder: z.number().int().min(0).max(999).default(0),
})

export const updateCounterSchema = createCounterSchema.omit({ eventId: true }).partial()

export type CreateQueueTypeInput = z.infer<typeof createQueueTypeSchema>
export type UpdateQueueTypeInput = z.infer<typeof updateQueueTypeSchema>
export type CreateCounterInput = z.infer<typeof createCounterSchema>
