import { defineApiHandler } from '../utils/handler'
import { ok } from '../utils/response'
import { prisma } from '../utils/prisma'
import { serviceDateString, DEFAULT_TIMEZONE } from '../utils/datetime'

export default defineApiHandler(async () => {
  const started = Date.now()
  await prisma.$queryRaw`SELECT 1`
  return ok({
    app: 'ANTREAN',
    status: 'ok',
    database: 'connected',
    latencyMs: Date.now() - started,
    timezone: DEFAULT_TIMEZONE,
    serviceDate: serviceDateString(),
  }, 'Service sehat')
})
