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
  .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Warna harus berformat hex, mis. #132b48')

export const slugSchema = z
  .string()
  .trim()
  .min(2, 'Minimal 2 karakter')
  .max(100)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Hanya huruf kecil, angka, dan tanda hubung')

/**
 * Bentuk skema PATCH dari sebuah skema "create".
 *
 * `.partial()` sendiri tidak cukup. Di Zod, `.default()` tetap ikut berjalan
 * meski fieldnya sudah dibuat opsional, jadi PATCH yang hanya mengirim satu
 * field tetap menghasilkan objek berisi nilai bawaan untuk semua field lain —
 * dan service yang memeriksa `input.x !== undefined` akan menulis ulang field
 * yang tidak pernah disentuh pengirim (mis. `padding` balik ke 3, `isActive`
 * balik ke true). Lapisan bawaan dilepas lebih dulu supaya field yang tidak
 * dikirim benar-benar absen dari hasil parse.
 *
 * Aturan `.min()`, `.regex()`, dan kawan-kawannya tetap utuh; yang dilepas
 * hanya lapisan bawaan paling luar. Bawaan di dalam objek/array bersarang
 * dibiarkan, karena di sana nilainya baru terpakai saat itemnya ikut dikirim.
 */
export function skemaPatch<T extends z.ZodObject<z.ZodRawShape>>(skema: T): ReturnType<T['partial']> {
  const bentuk: Record<string, z.ZodTypeAny> = {}
  for (const [kunci, nilai] of Object.entries(skema.shape as Record<string, z.ZodTypeAny>)) {
    const def = nilai.def as { type?: string, innerType?: z.ZodTypeAny }
    bentuk[kunci] = def.type === 'default' && def.innerType ? def.innerType : nilai
  }
  return z.object(bentuk).partial() as ReturnType<T['partial']>
}
