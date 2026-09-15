import type { H3Event } from 'h3'
import { errors } from './response'

interface Bucket { count: number, resetAt: number }

const buckets = new Map<string, Bucket>()
let lastSweep = Date.now()

/** Buang bucket kedaluwarsa sesekali supaya Map tidak tumbuh tanpa batas. */
function sweep(now: number) {
  if (now - lastSweep < 60_000) return
  lastSweep = now
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key)
  }
}

export interface RateLimitOptions {
  key: string
  limit: number
  windowMs: number
}

/**
 * Rate limit in-memory (§36). Cukup untuk satu instance; saat scale-out,
 * ganti penyimpanannya ke Redis tanpa mengubah pemanggilan.
 */
export function consumeRateLimit({ key, limit, windowMs }: RateLimitOptions) {
  const now = Date.now()
  sweep(now)

  const bucket = buckets.get(key)
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return { remaining: limit - 1, resetAt: now + windowMs }
  }

  bucket.count += 1
  if (bucket.count > limit) {
    const retryAfter = Math.ceil((bucket.resetAt - now) / 1000)
    throw errors.rateLimited(`Terlalu banyak permintaan. Coba lagi dalam ${retryAfter} detik.`)
  }

  return { remaining: limit - bucket.count, resetAt: bucket.resetAt }
}

export function clientIp(event: H3Event): string {
  return getRequestIP(event, { xForwardedFor: true }) ?? 'unknown'
}

/** Helper siap pakai untuk endpoint publik. */
export function rateLimit(event: H3Event, scope: string, limit: number, windowMs = 60_000) {
  const result = consumeRateLimit({ key: `${scope}:${clientIp(event)}`, limit, windowMs })
  setResponseHeader(event, 'X-RateLimit-Limit', String(limit))
  setResponseHeader(event, 'X-RateLimit-Remaining', String(Math.max(0, result.remaining)))
  return result
}
