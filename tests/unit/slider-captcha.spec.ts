import { beforeEach, describe, expect, it } from 'vitest'
import {
  CAPTCHA_CANVAS,
  consumeTicket,
  isAnswerRevealAllowed,
  issueChallenge,
  resetCaptchaStore,
  revealTarget,
  solveChallenge,
} from '../../server/utils/slider-captcha'

const IP = '203.0.113.9'

/** Geseran yang wajar: posisi tepat, cukup lama, dengan gerakan menengah. */
function jawab(id: string, x: number, ubah: Partial<{ durationMs: number, moves: number, ip: string }> = {}) {
  return solveChallenge({
    id,
    x,
    durationMs: ubah.durationMs ?? 800,
    moves: ubah.moves ?? 12,
    purpose: 'login',
    ip: ubah.ip ?? IP,
  })
}

beforeEach(() => resetCaptchaStore())

describe('teka-teki', () => {
  it('memberi dua gambar PNG dan posisi tegak potongan', () => {
    const c = issueChallenge('login', IP)

    expect(c.background.startsWith('data:image/png;base64,')).toBe(true)
    expect(c.piece.startsWith('data:image/png;base64,')).toBe(true)
    expect(c.pieceY).toBeGreaterThanOrEqual(0)
    expect(c.pieceY + c.pieceSize).toBeLessThanOrEqual(c.height)
    expect(c.width).toBe(CAPTCHA_CANVAS.width)
  })

  it('tidak pernah menaruh lubang di titik berangkat potongan', () => {
    // Kalau lubang bisa berada di x=0, "tidak menggeser sama sekali" kadang benar.
    for (let i = 0; i < 25; i++) {
      const c = issueChallenge('login', IP)
      expect(revealTarget(c.id)).toBeGreaterThan(c.pieceSize)
    }
  })

  it('memberi jawaban berbeda tiap kali diminta', () => {
    const posisi = new Set(
      Array.from({ length: 20 }, () => revealTarget(issueChallenge('login', IP).id)),
    )
    expect(posisi.size).toBeGreaterThan(1)
  })
})

describe('memeriksa geseran', () => {
  it('menerima posisi yang pas dan memberi tiket', () => {
    const c = issueChallenge('login', IP)
    const tiket = jawab(c.id, revealTarget(c.id)!)

    expect(typeof tiket).toBe('string')
    expect(tiket.length).toBeGreaterThan(20)
  })

  it('menerima meleset sedikit, menolak meleset jauh', () => {
    const a = issueChallenge('login', IP)
    expect(() => jawab(a.id, revealTarget(a.id)! + 4)).not.toThrow()

    const b = issueChallenge('login', IP)
    expect(() => jawab(b.id, revealTarget(b.id)! + 20)).toThrow()
  })

  it('menolak geseran yang terlalu cepat meski posisinya tepat', () => {
    const c = issueChallenge('login', IP)
    expect(() => jawab(c.id, revealTarget(c.id)!, { durationMs: 30 })).toThrow()
  })

  it('menolak lompatan tanpa gerakan menengah', () => {
    const c = issueChallenge('login', IP)
    expect(() => jawab(c.id, revealTarget(c.id)!, { moves: 1 })).toThrow()
  })

  it('membuang teka-teki setelah percobaan berulang', () => {
    const c = issueChallenge('login', IP)
    const benar = revealTarget(c.id)!

    // Empat kali meleset masih boleh — pengguna sungguhan pun sering meleset.
    for (let i = 0; i < 4; i++) expect(() => jawab(c.id, benar + 40)).toThrow()

    // Percobaan kelima ditolak mentah, dan teka-tekinya hangus meski jawabannya benar.
    expect(() => jawab(c.id, benar)).toThrow()
    expect(revealTarget(c.id)).toBeUndefined()
  })

  it('menolak teka-teki yang dikerjakan dari alamat lain', () => {
    const c = issueChallenge('login', IP)
    expect(() => jawab(c.id, revealTarget(c.id)!, { ip: '198.51.100.4' })).toThrow()
  })

  it('menolak id yang tidak dikenal', () => {
    expect(() => jawab('tidak-ada', 100)).toThrow()
  })
})

describe('tiket', () => {
  function tiketBaru(purpose: 'login' | 'queue' = 'login', ip = IP) {
    const c = issueChallenge(purpose, ip)
    return solveChallenge({ id: c.id, x: revealTarget(c.id)!, durationMs: 800, moves: 12, purpose, ip })
  }

  it('hanya bisa dipakai sekali', () => {
    const tiket = tiketBaru()
    expect(() => consumeTicket(tiket, 'login', IP)).not.toThrow()
    expect(() => consumeTicket(tiket, 'login', IP)).toThrow()
  })

  it('tidak bisa dipindah ke keperluan lain', () => {
    // Tiket dari halaman publik tidak boleh membuka jalan masuk ke aplikasi.
    const tiket = tiketBaru('queue')
    expect(() => consumeTicket(tiket, 'login', IP)).toThrow()
  })

  it('tidak bisa dipakai dari alamat lain', () => {
    const tiket = tiketBaru()
    expect(() => consumeTicket(tiket, 'login', '198.51.100.4')).toThrow()
  })

  it('menolak permintaan tanpa tiket sama sekali', () => {
    expect(() => consumeTicket(undefined, 'login', IP)).toThrow()
    expect(() => consumeTicket('', 'login', IP)).toThrow()
  })
})

describe('pembukaan jawaban untuk uji', () => {
  it('mati kecuali dinyalakan dengan sengaja', () => {
    const sebelumnya = process.env.CAPTCHA_DEV_BYPASS
    try {
      process.env.CAPTCHA_DEV_BYPASS = ''
      expect(isAnswerRevealAllowed()).toBe(false)

      process.env.CAPTCHA_DEV_BYPASS = '1'
      expect(isAnswerRevealAllowed()).toBe(true)
    }
    finally {
      process.env.CAPTCHA_DEV_BYPASS = sebelumnya
    }
  })
})
