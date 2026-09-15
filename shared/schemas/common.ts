import { z } from 'zod'

export const idSchema = z.string().length(26, 'ID tidak valid')

export const timeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Format jam harus HH:mm')

export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal harus YYYY-MM-DD')

export const hexColorSchema = z
  .string()
  .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Warna harus berformat hex, mis. #1b5cf5')

export const slugSchema = z
  .string()
  .trim()
  .min(2, 'Minimal 2 karakter')
  .max(100)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Hanya huruf kecil, angka, dan tanda hubung')
