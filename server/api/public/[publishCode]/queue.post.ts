import { z } from 'zod'
import { defineApiHandler } from '../../../utils/handler'
import { ok } from '../../../utils/response'
import { publicPageService } from '../../../services/public-page.service'
import { clientIp, rateLimit } from '../../../utils/rate-limit'
import { auditAsync, AUDIT_ACTIONS } from '../../../utils/audit'
import { emitQueueEvent } from '../../../realtime/emitters'
import { SOCKET_EVENTS } from '../../../../shared/constants/socket'
import { formatServiceDate } from '../../../utils/datetime'
import { idSchema } from '../../../../shared/schemas/common'
import { coordsOf, visitorCoordsSchema } from '../../../utils/geofence'

const bodySchema = z.object({
  queueTypeId: idSchema,
  values: z.record(z.string(), z.unknown()).default({}),
  captchaToken: z.string().max(4000).optional().nullable(),
  /** Tiket captcha geser; diminta bila formulir aktif mewajibkannya. */
  sliderToken: z.string().max(200).optional().nullable(),
}).extend(visitorCoordsSchema.shape)

/** Pengunjung mengambil nomor antrean. */
export default defineApiHandler(async (event) => {
  const config = useRuntimeConfig()
  rateLimit(event, 'public:take-queue', config.rateLimit.max, config.rateLimit.windowMs)

  const publishCode = getRouterParam(event, 'publishCode') as string
  const body = bodySchema.parse(await readBody(event))

  const queue = await publicPageService.register({
    publishCode,
    queueTypeId: body.queueTypeId,
    values: body.values,
    captchaToken: body.captchaToken,
    sliderToken: body.sliderToken,
    visitor: coordsOf(body),
    ipAddress: clientIp(event),
    userAgent: getRequestHeader(event, 'user-agent') ?? null,
  })

  auditAsync(event, {
    organizationId: queue.organizationId,
    action: AUDIT_ACTIONS.QUEUE_CREATED,
    entity: 'Queue',
    entityId: queue.id,
    newData: { queueNumber: queue.queueNumber, queueType: queue.queueType.name },
  })

  emitQueueEvent(SOCKET_EVENTS.QUEUE_CREATED, {
    queueId: queue.id,
    queueNumber: queue.queueNumber,
    status: queue.status,
    eventId: queue.eventId,
    queueTypeId: queue.queueTypeId,
    queueTypeName: queue.queueType.name,
    queueTypeCode: queue.queueType.code,
    queueTypeColor: queue.queueType.color,
    visitorName: queue.visitor?.fullName ?? null,
    serviceDate: formatServiceDate(queue.serviceDate),
  }, queue.organizationId)

  setResponseStatus(event, 201)
  return ok({
    queueNumber: queue.queueNumber,
    token: queue.publicToken,
    queueType: queue.queueType,
    serviceDate: formatServiceDate(queue.serviceDate),
    createdAt: queue.createdAt,
  }, 'Nomor antrean berhasil dibuat')
})
