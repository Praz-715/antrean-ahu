import { apiPending } from './useApiLoading'

/**
 * Apakah navigasi rute sedang berjalan.
 *
 * State tingkat modul, seperti `useApiLoading`: hanya relevan di klien dan tidak
 * boleh ikut terbawa saat SSR. Diisi `plugins/route-loading.client.ts`.
 */
const routeBusy = ref(false)

export const routePending = computed(() => routeBusy.value)

export function routeLoadingStart() {
  routeBusy.value = true
}

export function routeLoadingEnd() {
  routeBusy.value = false
}

export { apiPending }
