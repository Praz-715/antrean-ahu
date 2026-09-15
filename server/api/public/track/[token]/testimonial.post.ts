import { z } from 'zod'
import { defineApiHandler } from '../../../../utils/handler'
import { ok } from '../../../../utils/response'
import { testimonialService } from '../../../../services/testimonial.service'
import { notificationService } from '../../../../services/notification.service'
import { rateLimit } from '../../../../utils/rate-limit'

const bodySchema = z.object({
  rating: z.number().int().min(1, 'Beri penilaian 1–5').max(5),
  comment: z.string().trim().max(1000).optional().nullable(),
})

/** Pengunjung mengirim penilaian setelah layanan selesai (§23). */
export default defineApiHandler(async (event) => {
  rateLimit(event, 'public:testimonial', 10)

  const token = getRouterParam(event, 'token') as string
  const body = bodySchema.parse(await readBody(event))

  const { testimonial, organizationId, queueNumber } = await testimonialService.submit(token, body)

  // Admin cukup diberi tahu; testimoni yang butuh moderasi tidak boleh lewat begitu saja.
  notificationService.notifyAsync({
    organizationId,
    type: 'testimonial.created',
    payload: { queueNumber, rating: testimonial.rating, needsModeration: !testimonial.isApproved },
  })

  setResponseStatus(event, 201)
  return ok(testimonial, 'Terima kasih atas penilaian Anda')
})
