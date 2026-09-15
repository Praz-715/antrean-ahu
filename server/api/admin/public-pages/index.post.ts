import { z } from 'zod'
import { defineApiHandler } from '../../../utils/handler'
import { ok } from '../../../utils/response'
import { requireOrganization, requirePermission } from '../../../utils/context'
import { publishService } from '../../../services/publish.service'
import { idSchema } from '../../../../shared/schemas/common'
import { publicPageThemeSchema } from '../../../../shared/schemas/public-page'
import { PERMISSIONS } from '../../../../shared/constants/permissions'

const bodySchema = z.object({
  eventId: idSchema,
  title: z.string().trim().min(2, 'Judul minimal 2 karakter').max(150),
  subtitle: z.string().trim().max(190).optional().nullable(),
  description: z.string().trim().max(2000).optional().nullable(),
  slug: z.string().trim().max(120).optional().nullable(),
  /**
   * Logo, gambar latar, dan informasi layanan HARUS diterima di sini, bukan hanya
   * saat menyunting: modal "Halaman Publik Baru" sudah menyediakan ketiganya, dan
   * sebelumnya nilainya dibuang tanpa pesan apa pun — admin mengisi logo, menekan
   * simpan, lalu logonya hilang tanpa penjelasan.
   */
  logoUrl: z.string().trim().max(500).optional().nullable(),
  backgroundUrl: z.string().trim().max(500).optional().nullable(),
  // Disimpan & ditampilkan sebagai TEKS BIASA, bukan HTML (tidak ada sanitizer).
  infoHtml: z.string().max(5000).optional().nullable(),
  allowedQueueTypeIds: z.array(idSchema).default([]),
  maxPerIpPerDay: z.number().int().min(0).max(1000).default(5),
  requireCaptcha: z.boolean().default(false),
  /**
   * Tampilan halaman — divalidasi skema bersama, bukan JSON bebas seperti dulu.
   * Kunci yang tidak dikenal dibuang, kunci yang hilang memakai nilai bawaannya.
   */
  /**
   * Pagar lokasi (§36). Radius dalam meter; 50 m sudah sesempit ketelitian GPS
   * ponsel, dan di atas 50 km pagarnya tidak lagi berarti apa-apa.
   */
  geofenceEnabled: z.boolean().optional(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  geofenceRadiusM: z.number().int().min(50).max(50_000).optional(),
  theme: publicPageThemeSchema.optional(),
})

export default defineApiHandler(async (event) => {
  const ctx = await requirePermission(event, PERMISSIONS.PUBLIC_PAGE_MANAGE)
  const input = bodySchema.parse(await readBody(event))
  const page = await publishService.create(requireOrganization(ctx), input)
  setResponseStatus(event, 201)
  return ok(page, 'Halaman publik dibuat')
})
