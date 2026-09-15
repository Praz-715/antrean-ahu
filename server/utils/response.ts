import { ERROR_CODES, type ErrorCode } from '../../shared/constants/errors'
import type { ApiFailure, ApiSuccess } from '../../shared/types/api'

/** Error aplikasi yang sudah punya kode & status HTTP. Dipetakan oleh error handler global. */
export class AppError extends Error {
  readonly code: ErrorCode
  readonly statusCode: number
  readonly errors?: Record<string, string[]>

  constructor(code: ErrorCode, message: string, statusCode = 400, errors?: Record<string, string[]>) {
    super(message)
    this.name = 'AppError'
    this.code = code
    this.statusCode = statusCode
    this.errors = errors
  }
}

export const errors = {
  notFound: (message = 'Data tidak ditemukan') => new AppError(ERROR_CODES.NOT_FOUND, message, 404),
  validation: (message = 'Data yang dikirim tidak valid', fields?: Record<string, string[]>) =>
    new AppError(ERROR_CODES.VALIDATION_ERROR, message, 422, fields),
  unauthenticated: (message = 'Silakan login terlebih dahulu') =>
    new AppError(ERROR_CODES.UNAUTHENTICATED, message, 401),
  forbidden: (message = 'Anda tidak memiliki akses untuk tindakan ini') =>
    new AppError(ERROR_CODES.FORBIDDEN, message, 403),
  conflict: (code: ErrorCode, message: string) => new AppError(code, message, 409),
  badRequest: (code: ErrorCode, message: string) => new AppError(code, message, 400),
  rateLimited: (message = 'Terlalu banyak permintaan. Coba lagi sebentar lagi.') =>
    new AppError(ERROR_CODES.RATE_LIMITED, message, 429),
}

export function ok<T>(data: T, message = 'OK'): ApiSuccess<T> {
  return { success: true, message, data }
}

export function fail(code: ErrorCode, message: string, fields?: Record<string, string[]>): ApiFailure {
  return { success: false, message, code, data: null, ...(fields ? { errors: fields } : {}) }
}
