import { z } from 'zod'
import { defineApiHandler } from '../../../utils/handler'
import { ok } from '../../../utils/response'
import { requireOrganization, requirePermission } from '../../../utils/context'
import { publishService } from '../../../services/publish.service'
import { idSchema } from '../../../../shared/schemas/common'
import { publicPageThemeSchema } from '../../../../shared/schemas/public-page'
import { PERMISSIONS } from '../../../../shared/constants/permissions'

const bodySchema = z.object({
  title: z.string().trim().min(2).max(150).optional(),
  subtitle: z.string().trim().max(190).optional().nullable(),
  description: z.string().trim().max(2000).optional().nullable(),
  slug: z.string().trim().max(120).optional().nullable(),
  logoUrl: z.string().trim().max(500).optional().nullable(),
  backgroundUrl: z.string().trim().max(500).optional().nullable(),
  // Disimpan & ditampilkan sebagai TEKS BIASA, bukan HTML — tidak ada sanitizer di
  // sistem ini, jadi jangan pernah merender markup dari input admin.
  infoHtml: z.string().max(5000).optional().nullable(),
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
  allowedQueueTypeIds: z.array(idSchema).optional(),
  maxPerIpPerDay: z.number().int().min(0).max(1000).optional(),
  requireCaptcha: z.boolean().optional(),
})

export default defineApiHandler(async (event) => {
  const ctx = await requirePermission(event, PERMISSIONS.PUBLIC_PAGE_MANAGE)
  const id = getRouterParam(event, 'id') as string
  const input = bodySchema.parse(await readBody(event))
  return ok(await publishService.update(requireOrganization(ctx), id, input), 'Halaman publik diperbarui')
})
