/**
 * Apakah layar sedang selebar ponsel.
 *
 * Dipakai untuk hal yang tidak bisa diselesaikan CSS — misalnya memutuskan jendela
 * pengambilan nomor tampil sebagai dialog tengah atau layar penuh. Nilainya `false`
 * saat render server: ukuran layar tidak diketahui di sana, dan menebaknya hanya
 * membuat hasil hidrasi berbeda dari yang digambar peramban.
 */
export function useIsMobile(maxWidth = 640) {
  const isMobile = ref(false)

  onMounted(() => {
    const mq = window.matchMedia(`(max-width: ${maxWidth - 1}px)`)
    const terapkan = () => { isMobile.value = mq.matches }

    terapkan()
    mq.addEventListener('change', terapkan)
    onBeforeUnmount(() => mq.removeEventListener('change', terapkan))
  })

  return isMobile
}
