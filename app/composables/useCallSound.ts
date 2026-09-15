/**
 * Pemutar berkas audio untuk layar antrean: nada panggil dan suara TTS eksternal.
 *
 * Terpisah dari `useSpeech()` karena mesinnya memang berbeda — yang satu merangkai
 * ucapan lewat Web Speech API, yang ini memutar berkas. Satu elemen `<audio>` dipakai
 * ulang untuk semuanya supaya "izin bunyi" yang didapat dari satu ketukan pengguna
 * tetap berlaku untuk pemutaran berikutnya.
 */
/**
 * Hasil satu pemutaran.
 *
 * `diganti` ada karena satu elemen dipakai bersama: begitu panggilan berikutnya
 * datang, pemutaran yang sedang jalan memang harus berhenti — dan itu BUKAN
 * kegagalan. Membedakannya penting: pemanggil hanya boleh jatuh ke cara lain
 * (suara peramban) saat benar-benar `gagal`. Sebelum pembedaan ini ada, panggilan
 * yang datang beruntun membuat pemutaran pertama dianggap gagal, lalu nomornya
 * dibacakan ulang oleh suara peramban — terdengar sebagai dua suara bertumpuk.
 */
export type HasilPutar = 'selesai' | 'gagal' | 'diganti'

export function useCallSound() {
  let element: HTMLAudioElement | null = null
  /** Penghenti pemutaran yang sedang berjalan; diisi ulang tiap kali `play()` dipanggil. */
  let hentikanYangBerjalan: (() => void) | null = null

  function audio(): HTMLAudioElement | null {
    if (typeof window === 'undefined') return null
    if (!element) {
      element = new Audio()
      element.preload = 'auto'
    }
    return element
  }

  /**
   * Putar satu berkas sampai selesai.
   *
   * Selalu ada batas waktu: berkas yang macet di tengah jaringan tidak boleh
   * menggantung panggilan berikutnya.
   */
  function play(url: string, options: { volume?: number, timeoutMs?: number } = {}): Promise<HasilPutar> {
    const el = audio()
    if (!el) return Promise.resolve('gagal')

    // Pemutaran sebelumnya ditutup dulu sebagai "diganti", bukan dibiarkan
    // menunggu batas waktunya sendiri lalu melapor gagal.
    hentikanYangBerjalan?.()

    const timeoutMs = options.timeoutMs ?? 15_000

    return new Promise<HasilPutar>((resolve) => {
      let selesai = false
      const beres = (hasil: HasilPutar) => {
        if (selesai) return
        selesai = true
        clearTimeout(timer)
        el.onended = null
        el.onerror = null
        if (hentikanYangBerjalan === diganti) hentikanYangBerjalan = null
        resolve(hasil)
      }
      const diganti = () => beres('diganti')

      const timer = setTimeout(() => beres('gagal'), timeoutMs)
      hentikanYangBerjalan = diganti

      el.onended = () => beres('selesai')
      el.onerror = () => beres('gagal')
      el.volume = options.volume ?? 1
      el.src = url
      el.currentTime = 0
      el.play().catch(() => beres('gagal'))
    })
  }

  /**
   * Dapatkan izin bunyi dari ketukan pengguna.
   *
   * Peramban menolak `play()` yang tidak berasal dari interaksi. Dipanggil dari
   * tombol "Aktifkan Suara": berkasnya diputar tanpa volume lalu langsung dihentikan,
   * cukup untuk membuat elemen ini dianggap sudah diizinkan berbunyi.
   */
  async function unlock(url?: string | null) {
    const el = audio()
    if (!el || !url) return
    el.volume = 0
    el.src = url
    try {
      await el.play()
      el.pause()
      el.currentTime = 0
    }
    catch {
      // Diabaikan: kalau pun gagal, pemutaran berikutnya hanya akan kehilangan bunyi,
      // bukan mengganggu tampilan layar.
    }
    finally {
      el.volume = 1
    }
  }

  function stop() {
    if (!element) return
    element.pause()
    element.currentTime = 0
  }

  return { play, unlock, stop }
}
