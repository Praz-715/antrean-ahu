import { describe, expect, it } from 'vitest'
import { byCodeOrSlug, pickCanonical } from '../../server/utils/public-page-lookup'

describe('mencari halaman publik lewat dua alamat', () => {
  it('mencocokkan kode publikasi maupun slug', () => {
    expect(byCodeOrSlug('w8j4hz76')).toEqual({
      OR: [{ publishCode: 'w8j4hz76' }, { slug: 'w8j4hz76' }],
    })
  })

  it('memenangkan kode publikasi bila slug halaman lain kebetulan sama', () => {
    // Tautan yang sudah tercetak di QR tidak boleh berpindah tujuan hanya karena
    // admin lain memilih slug yang bentuknya sama dengan kode itu.
    const baris = [
      { publishCode: 'aaaa1111', slug: 'w8j4hz76' },
      { publishCode: 'w8j4hz76', slug: 'layanan-ahu' },
    ]
    expect(pickCanonical(baris, 'w8j4hz76')?.publishCode).toBe('w8j4hz76')
  })

  it('memakai satu-satunya baris bila yang cocok hanya slug', () => {
    const baris = [{ publishCode: 'w8j4hz76', slug: 'layanan-ahu' }]
    expect(pickCanonical(baris, 'layanan-ahu')?.publishCode).toBe('w8j4hz76')
  })

  it('tidak memilih apa pun bila tidak ada yang cocok', () => {
    expect(pickCanonical([], 'entah')).toBeUndefined()
  })
})
