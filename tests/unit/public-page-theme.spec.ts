import { describe, expect, it } from 'vitest'
import { accentOf, parsePublicPageTheme, publicPageThemeSchema } from '../../shared/schemas/public-page'
import { matchPreset } from '../../shared/constants/public-page'
import { formatDateRange } from '../../shared/utils/service-date'
import { onColor, withAlpha } from '../../shared/utils/color'

describe('tema halaman publik', () => {
  it('mengisi seluruh bagian dengan nilai bawaan', () => {
    const t = parsePublicPageTheme({})

    expect(t.primaryColor).toBe('#1b5cf5')
    expect(t.hero.enabled).toBe(true)
    expect(t.hero.align).toBe('center')
    expect(t.services.columns).toBe(3)
    expect(t.info.style).toBe('cards')
    expect(t.footer.showPoweredBy).toBe(true)
  })

  /**
   * Syarat utama pembaruan ini: halaman yang sudah terbit hari ini memakai tema
   * berbentuk lama, dan tampilannya tidak boleh berubah karenanya.
   */
  it('membaca tema lama apa adanya', () => {
    const lama = { primaryColor: '#4f5379', secondaryColor: '#0f172a', footerText: 'Galeri Inovasi AHU 2026' }
    const t = parsePublicPageTheme(lama)

    expect(t.primaryColor).toBe('#4f5379')
    expect(t.secondaryColor).toBe('#0f172a')
    expect(t.footerText).toBe('Galeri Inovasi AHU 2026')
    expect(t.hero.enabled).toBe(true)
  })

  it('membuang kunci yang tidak dikenal', () => {
    const t = parsePublicPageTheme({ primaryColor: '#1b5cf5', warnaAjaib: 'merah' }) as Record<string, unknown>
    expect(t.warnaAjaib).toBeUndefined()
  })

  it('mempertahankan nilai yang sah ketika ada nilai rusak', () => {
    // Warna utama rusak (mis. hasil sunting langsung di database), sisanya masih baik.
    const t = parsePublicPageTheme({
      primaryColor: 'biru tua',
      secondaryColor: '#123456',
      services: { columns: 4 },
    })

    expect(t.primaryColor).toBe('#1b5cf5')
    expect(t.secondaryColor).toBe('#123456')
    expect(t.services.columns).toBe(4)
  })

  it('menolak nilai tidak sah saat divalidasi di API', () => {
    // Di jalur API skemanya tetap ketat — admin harus diberi tahu, bukan didiamkan.
    expect(publicPageThemeSchema.safeParse({ primaryColor: 'biru' }).success).toBe(false)
    expect(publicPageThemeSchema.safeParse({ services: { columns: 9 } }).success).toBe(false)
    expect(publicPageThemeSchema.safeParse({ hero: { align: 'atas' } }).success).toBe(false)
  })

  it('warna aksen mengikuti warna utama bila dikosongkan', () => {
    expect(accentOf(parsePublicPageTheme({ primaryColor: '#123456' }))).toBe('#123456')
    expect(accentOf(parsePublicPageTheme({ primaryColor: '#123456', accentColor: '#abcdef' }))).toBe('#abcdef')
  })

  it('mengenali paket warna yang sedang dipakai', () => {
    expect(matchPreset('#14306b', '#0b1c3d', '#c8952a')).toBe('government')
    expect(matchPreset('#14306b', '#0b1c3d', '#ffffff')).toBe('custom')
  })
})

describe('warna di atas warna', () => {
  it('memilih teks putih di atas warna gelap dan teks gelap di atas warna terang', () => {
    expect(onColor('#1b5cf5')).toBe('#ffffff')
    expect(onColor('#0f172a')).toBe('#ffffff')
    expect(onColor('#fde047')).toBe('#0f172a')
    expect(onColor('#ffffff')).toBe('#0f172a')
  })

  it('mengembalikan putih untuk nilai yang bukan warna', () => {
    expect(onColor('bukan-warna')).toBe('#ffffff')
  })

  it('menyusun warna transparan yang sah untuk CSS', () => {
    expect(withAlpha('#1b5cf5', 0.12)).toBe('rgb(27 92 245 / 0.12)')
  })
})

describe('rentang tanggal event', () => {
  it('menulis satu tanggal secara utuh', () => {
    expect(formatDateRange('2026-09-12', '2026-09-12')).toBe('12 September 2026')
    expect(formatDateRange('2026-09-12', null)).toBe('12 September 2026')
  })

  it('tidak mengulang bulan dan tahun yang sama', () => {
    expect(formatDateRange('2026-09-12', '2026-09-16')).toBe('12 – 16 September 2026')
  })

  it('menulis bulan kedua kali bila bulannya berbeda', () => {
    expect(formatDateRange('2026-09-28', '2026-10-02')).toBe('28 September – 2 Oktober 2026')
  })

  it('menulis tahun kedua kali bila tahunnya berbeda', () => {
    expect(formatDateRange('2026-12-30', '2027-01-02')).toBe('30 Desember 2026 – 2 Januari 2027')
  })

  it('kosong bila tidak ada tanggal sama sekali', () => {
    expect(formatDateRange(null, null)).toBe('')
  })
})
