/**
 * Penghitung permintaan API yang sedang berjalan.
 *
 * Dipakai plugin `api-loading.client.ts` untuk menyalakan bilah progres bawaan Nuxt,
 * sehingga aksi apa pun — termasuk yang dipicu dari item dropdown yang tidak punya
 * tombolnya sendiri — tetap terlihat sedang diproses.
 *
 * State-nya sengaja di level modul (bukan `useState`) karena hanya relevan di klien
 * dan tidak boleh ikut terbawa saat SSR.
 */
const pendingCount = ref(0)

export const apiPending = computed(() => pendingCount.value > 0)

export function beginApiCall() {
  if (import.meta.client) pendingCount.value++
}

export function endApiCall() {
  if (import.meta.client) pendingCount.value = Math.max(0, pendingCount.value - 1)
}
