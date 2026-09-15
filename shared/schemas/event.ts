import { z } from 'zod'
import { VOICE_PROVIDERS } from '../constants/settings'
import { dateSchema, hexColorSchema, slugSchema, timeSchema } from './common'

export const EVENT_STATUSES = ['DRAFT', 'SCHEDULED', 'OPEN', 'PAUSED', 'CLOSED', 'COMPLETED'] as const

export const eventBrandingSchema = z.object({
  primaryColor: hexColorSchema.optional(),
  secondaryColor: hexColorSchema.optional(),
  logoUrl: z.string().max(500).optional(),
  backgroundUrl: z.string().max(500).optional(),
  fontFamily: z.string().max(120).optional(),
  footerText: z.string().max(255).optional(),
}).partial()

export const eventSettingsSchema = z.object({
  recallLimit: z.number().int().min(0).max(20).optional(),
  estimateEnabled: z.boolean().optional(),
  maxWaitingPerType: z.number().int().min(0).optional(),
  ratingEnabled: z.boolean().optional(),
  voiceEnabled: z.boolean().optional(),
  voiceLanguage: z.string().max(10).optional(),
  /** Sumber suara panggilan; kosongkan agar ikut pengaturan sistem. */
  voiceProvider: z.enum(VOICE_PROVIDERS).optional(),
  /**
   * Nada panggil: `system:toneN` (bawaan) atau id berkas Media Library.
   * String kosong = sengaja tanpa nada di event ini.
   */
  voiceChimeMediaId: z.string().trim().max(48).optional(),
}).partial()

export const createEventSchema = z.object({
  name: z.string().trim().min(3, 'Nama event minimal 3 karakter').max(150),
  slug: slugSchema.optional(),
  description: z.string().trim().max(2000).optional(),
  timezone: z.string().min(2).max(64).default('Asia/Jakarta'),
  startDate: dateSchema.optional().nullable(),
  endDate: dateSchema.optional().nullable(),
  allowFinishAfterClose: z.boolean().default(true),
  branding: eventBrandingSchema.optional(),
  settings: eventSettingsSchema.optional(),
})

export const updateEventSchema = createEventSchema.partial()

export const eventStatusSchema = z.object({
  status: z.enum(EVENT_STATUSES),
})

export const scheduleItemSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  openTime: timeSchema,
  closeTime: timeSchema,
  isClosed: z.boolean().default(false),
  note: z.string().max(255).optional().nullable(),
}).refine(
  s => s.isClosed || s.openTime < s.closeTime,
  { message: 'Jam tutup harus lebih besar dari jam buka', path: ['closeTime'] },
)

export const updateSchedulesSchema = z.object({
  schedules: z.array(scheduleItemSchema).max(7),
})

export type CreateEventInput = z.infer<typeof createEventSchema>
export type UpdateEventInput = z.infer<typeof updateEventSchema>
export type ScheduleItemInput = z.infer<typeof scheduleItemSchema>
