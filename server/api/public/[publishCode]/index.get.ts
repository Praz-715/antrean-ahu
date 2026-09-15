import { defineApiHandler } from '../../../utils/handler'
import { ok } from '../../../utils/response'
import { publicPageService } from '../../../services/public-page.service'
import { rateLimit } from '../../../utils/rate-limit'
import { coordsOf, visitorCoordsSchema } from '../../../utils/geofence'

/** Konfigurasi halaman publik: branding, layanan, formulir, status buka. */
export default defineApiHandler(async (event) => {
  rateLimit(event, 'public:page', 120)
  const publishCode = getRouterParam(event, 'publishCode') as string

  /**
   * Koordinat pengunjung ikut di kueri, bukan di header atau cookie: halaman ini
   * dirender di server, dan hanya kueri yang ikut terbawa saat halamannya diminta
   * ulang dengan lokasi yang baru didapat.
   */
  const visitor = coordsOf(visitorCoordsSchema.parse(getQuery(event)))

  return ok(await publicPageService.getByPublishCode(publishCode, visitor))
})
