import { readableColor } from '#shared/utils/color'

/**
 * Warna jenis antrean yang aman dipakai sebagai warna teks pada tema apa pun.
 *
 * Dibungkus composable supaya tiap halaman tidak perlu memanggil `useColorMode()`
 * sendiri — dan supaya perpindahan tema langsung terasa tanpa memuat ulang.
 */
export function useReadableColor() {
  const colorMode = useColorMode()
  const isDark = computed(() => colorMode.value === 'dark')

  return {
    isDark,
    /** Warna teks yang sudah disesuaikan dengan tema aktif. */
    readable: (hex: string | null | undefined) => (hex ? readableColor(hex, isDark.value) : undefined),
  }
}
