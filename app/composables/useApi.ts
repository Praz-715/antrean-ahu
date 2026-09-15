import type { FetchOptions } from 'ofetch'
import type { ApiResponse } from '#shared/types/api'
import { beginApiCall, endApiCall } from './useApiLoading'

export class ApiError extends Error {
  code: string
  errors?: Record<string, string[]>
  constructor(message: string, code: string, errors?: Record<string, string[]>) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.errors = errors
  }
}

/**
 * Pembungkus $fetch yang membuka amplop { success, message, data } (§56)
 * dan mengubah kegagalan menjadi ApiError berisi kode + pesan siap tampil.
 */
export async function apiFetch<T>(url: string, options: FetchOptions = {}): Promise<T> {
  // Saat SSR, cookie sesi harus diteruskan manual ke internal API.
  if (import.meta.server) {
    /**
     * `useRequestHeaders` melempar bila dipanggil di luar konteks Nuxt — misalnya
     * dari permintaan yang baru dimulai setelah `await` di dalam setup. Kegagalan
     * membaca cookie sebaiknya berujung pada satu permintaan tanpa sesi, bukan
     * halaman 500: pemanggilnya masih bisa menangani respons 401 dengan wajar.
     */
    let requestHeaders: Record<string, string>
    try {
      requestHeaders = useRequestHeaders(['cookie'])
    }
    catch {
      requestHeaders = {}
    }
    options = { ...options, headers: { ...requestHeaders, ...(options.headers as Record<string, string>) } }
  }

  let res: ApiResponse<T>
  beginApiCall()
  try {
    res = await $fetch<ApiResponse<T>>(url, options as never)
  }
  catch (error) {
    const body = (error as { data?: ApiResponse<T> }).data
    if (body && typeof body === 'object' && 'success' in body && !body.success) {
      throw new ApiError(body.message, body.code, body.errors)
    }
    throw new ApiError('Tidak dapat terhubung ke server', 'NETWORK_ERROR')
  }
  finally {
    endApiCall()
  }

  if (!res.success) throw new ApiError(res.message, res.code, res.errors)
  return res.data
}

/** Versi yang otomatis menampilkan toast saat gagal — untuk aksi tombol. */
export function useApi() {
  const toast = useToast()

  async function call<T>(url: string, options: FetchOptions = {}, successMessage?: string): Promise<T | null> {
    try {
      const data = await apiFetch<T>(url, options)
      if (successMessage) {
        toast.add({ title: successMessage, color: 'success', icon: 'i-lucide-check-circle' })
      }
      return data
    }
    catch (error) {
      const err = error as ApiError
      toast.add({
        title: 'Gagal',
        description: err.message,
        color: 'error',
        icon: 'i-lucide-alert-circle',
      })
      return null
    }
  }

  return { call, apiFetch }
}
