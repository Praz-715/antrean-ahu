export interface UseNowOptions {
  /** Selang penyegaran setelah komponen terpasang. */
  intervalMs?: number
  /**
   * Kunci state. Pemakai dengan kebutuhan selang berbeda harus memakai kunci
   * berbeda — jam display berdetak tiap detik, sedangkan label "5 menit lalu"
   * cukup setengah menit, dan keduanya tidak boleh saling menimpa.
   */
  key?: string
}

/**
 * Waktu acuan bersama untuk apa pun yang bergantung "sekarang".
 *
 * Label seperti "5 menit lalu", jam pada layar antrean, atau lencana "Tampil
 * sekarang" berbahaya bila membaca `Date.now()`/`new Date()` langsung di dalam
 * render: server merender pada satu detik, klien menghidrasi beberapa saat
 * kemudian, dan Vue melaporkannya sebagai mismatch hidrasi — yang di produksi
 * berarti sebagian DOM dibuang lalu digambar ulang.
 *
 * `useState` membuat nilainya ikut terkirim dari server, jadi render pertama di
 * kedua sisi identik. Setelah terpasang, nilainya diperbarui berkala supaya
 * tampilannya tetap hidup tanpa perlu memuat ulang halaman.
 */
export function useNow(options: UseNowOptions | number = {}) {
  const { intervalMs = 30_000, key = 'antrean:now' }
    = typeof options === 'number' ? { intervalMs: options } : options

  const now = useState<number>(key, () => Date.now())

  onMounted(() => {
    // Segarkan sekali setelah hidrasi supaya selisih dengan waktu SSR langsung hilang.
    now.value = Date.now()
    const timer = setInterval(() => { now.value = Date.now() }, intervalMs)
    onBeforeUnmount(() => clearInterval(timer))
  })

  return now
}
