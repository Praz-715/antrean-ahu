import { createLogger } from '../utils/logger'

const log = createLogger('nitro')

/** Logging terpusat untuk error yang lolos sampai ke Nitro. */
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('error', (error, ctx) => {
    log.error('unhandled error', {
      path: ctx?.event?.path,
      message: error instanceof Error ? error.message : String(error),
    })
  })
})
