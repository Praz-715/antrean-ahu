/**
 * Format response API tunggal untuk seluruh sistem (§56).
 * Semua handler wajib melewati helper `ok()` / `fail()` di server/utils/response.ts.
 */
export interface ApiSuccess<T = unknown> {
  success: true
  message: string
  data: T
}

export interface ApiFailure {
  success: false
  message: string
  code: string
  data: null
  errors?: Record<string, string[]>
}

export type ApiResponse<T = unknown> = ApiSuccess<T> | ApiFailure

export interface Paginated<T> {
  items: T[]
  total: number
  page: number
  perPage: number
  totalPages: number
}
