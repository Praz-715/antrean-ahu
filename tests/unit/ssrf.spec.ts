import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { assertSafeUrl, isPrivateAddress } from '../../server/utils/ssrf'

/**
 * Penjaga permintaan keluar (§6, §36).
 *
 * Diuji sebagai unit karena inilah satu-satunya lapisan yang menghentikan kolom URL
 * milik admin berubah menjadi pemindai jaringan internal. Perilakunya harus pasti,
 * bukan bergantung pada konfigurasi mesin yang kebetulan sedang dipakai.
 */
describe('isPrivateAddress', () => {
  it.each([
    '127.0.0.1',
    '10.1.2.3',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.1.1',
    '169.254.169.254', // metadata cloud
    '100.64.0.1', // CGNAT
    '0.0.0.0',
    '224.0.0.1', // multicast
    '::1',
    'fd00::1',
    'fe80::1',
    '::ffff:127.0.0.1',
  ])('menolak %s sebagai alamat internal', (ip) => {
    expect(isPrivateAddress(ip)).toBe(true)
  })

  it.each(['8.8.8.8', '1.1.1.1', '203.0.113.10', '172.32.0.1', '2606:4700::1111'])(
    'mengizinkan %s sebagai alamat publik',
    (ip) => {
      expect(isPrivateAddress(ip)).toBe(false)
    },
  )

  it('menolak teks yang bukan alamat IP', () => {
    expect(isPrivateAddress('bukan-ip')).toBe(true)
  })
})

describe('assertSafeUrl', () => {
  const saved = { ...process.env }

  beforeEach(() => {
    delete process.env.DATA_SOURCE_ALLOW_PRIVATE
    delete process.env.DATA_SOURCE_HOST_ALLOWLIST
  })

  afterEach(() => {
    process.env.DATA_SOURCE_ALLOW_PRIVATE = saved.DATA_SOURCE_ALLOW_PRIVATE
    process.env.DATA_SOURCE_HOST_ALLOWLIST = saved.DATA_SOURCE_HOST_ALLOWLIST
  })

  it('menolak skema selain http/https', async () => {
    await expect(assertSafeUrl('file:///etc/passwd')).rejects.toThrow(/http dan https/)
    await expect(assertSafeUrl('ftp://contoh.id/data')).rejects.toThrow(/http dan https/)
  })

  it('menolak URL yang membawa kredensial', async () => {
    await expect(assertSafeUrl('https://admin:rahasia@contoh.id/api')).rejects.toThrow(/kredensial di dalam URL/)
  })

  it('menolak alamat internal', async () => {
    await expect(assertSafeUrl('http://127.0.0.1:3306/')).rejects.toThrow(/alamat internal/)
    await expect(assertSafeUrl('http://169.254.169.254/latest/meta-data')).rejects.toThrow(/alamat internal/)
  })

  it('mengizinkan alamat internal hanya bila dinyatakan eksplisit', async () => {
    process.env.DATA_SOURCE_ALLOW_PRIVATE = 'true'
    await expect(assertSafeUrl('http://127.0.0.1:8080/api')).resolves.toMatchObject({ addresses: ['127.0.0.1'] })
  })

  /**
   * Kelonggaran untuk pengembangan tidak boleh sekalian membuka endpoint metadata
   * cloud — di sanalah kredensial instance dibagikan ke siapa pun yang bertanya.
   */
  it('alamat metadata cloud tetap diblokir walau host privat diizinkan', async () => {
    process.env.DATA_SOURCE_ALLOW_PRIVATE = 'true'
    await expect(assertSafeUrl('http://169.254.169.254/latest/meta-data')).rejects.toThrow(/selalu diblokir/)
    await expect(assertSafeUrl('http://224.0.0.1/')).rejects.toThrow(/selalu diblokir/)
  })

  it('menghormati daftar host yang diizinkan', async () => {
    process.env.DATA_SOURCE_HOST_ALLOWLIST = 'api.contoh.id'
    await expect(assertSafeUrl('https://lain.contoh.id/api')).rejects.toThrow(/daftar host yang diizinkan/)
  })

  it('menolak nama host yang tidak bisa diresolusi', async () => {
    await expect(assertSafeUrl('https://host-yang-pasti-tidak-ada.antrean-invalid/api'))
      .rejects.toThrow(/tidak dapat diresolusi/)
  })
})
