import type { H3Event } from 'h3'
import { ZodError } from 'zod'
import { AppError, fail } from './response'
import { ERROR_CODES } from '../../shared/constants/errors'
import { createLogger } from './logger'

const log = createLogger('api')

/**
 * Pembungkus handler API (§56): apa pun yang dilempar service berubah menjadi
 * satu bentuk response { success, message, code, data }.
 * Seluruh file di server/api WAJIB memakai ini, bukan defineEventHandler langsung.
 */
export function defineApiHandler<T>(handler: (event: H3Event) => Promise<T> | T) {
  return defineEventHandler(async (event) => {
    try {
      return await handler(event)
    }
    catch (error) {
      return toErrorResponse(event, error)
    }
  })
}

export function toErrorResponse(event: H3Event, error: unknown) {
  if (error instanceof AppError) {
    setResponseStatus(event, error.statusCode)
    return fail(error.code, error.message, error.errors)
  }

  if (error instanceof ZodError) {
    setResponseStatus(event, 422)
    const fields: Record<string, string[]> = {}
    for (const issue of error.issues) {
      const key = issue.path.join('.') || '_'
      ;(fields[key] ??= []).push(issue.message)
    }
    return fail(ERROR_CODES.VALIDATION_ERROR, 'Data yang dikirim tidak valid', fields)
  }

  const anyErr = error as { statusCode?: number, statusMessage?: string, message?: string }
  if (anyErr?.statusCode && anyErr.statusCode < 500) {
    setResponseStatus(event, anyErr.statusCode)
    return fail(ERROR_CODES.INTERNAL_ERROR, anyErr.statusMessage || anyErr.message || 'Permintaan tidak dapat diproses')
  }

  log.error('unexpected error', { path: event.path, message: anyErr?.message ?? String(error) })
  setResponseStatus(event, 500)
  return fail(
    ERROR_CODES.INTERNAL_ERROR,
    process.env.NODE_ENV === 'production'
      ? 'Terjadi kesalahan pada server'
      : (anyErr?.message ?? 'Terjadi kesalahan pada server'),
  )
}
