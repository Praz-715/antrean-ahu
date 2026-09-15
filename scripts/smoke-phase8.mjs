/**
 * Uji Phase 8: penjadwal buka/tutup otomatis, header keamanan, rate limit,
 * dan pengetatan unggahan.
 *
 * Jalankan: npm run smoke:phase8   (server dev harus sudah berjalan)
 */
import { headerCaptcha } from './captcha.mjs'

/** Alamat server yang diuji; timpa dengan SMOKE_BASE untuk menguji hasil build. */
const BASE = process.env.SMOKE_BASE || 'http://localhost:3000'
const results = []

function record(name, ok, detail) {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'OK  ' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
}

let cookie = ''
async function api(method, path, body, extraHeaders = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      ...(await headerCaptcha(BASE, path)),
      'Content-Type': 'application/json',
      'Origin': BASE,
      ...(cookie ? { cookie } : {}),
      ...extraHeaders,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const sc = res.headers.getSetCookie?.() ?? []
  if (sc.length) cookie = sc.map(c => c.split(';')[0]).join('; ')
  return res.json()
}

const sessions = new Map()
async function login(email, password = 'password123') {
  const saved = sessions.get(email)
  if (saved) { cookie = saved; return }
  for (let attempt = 1; attempt <= 3; attempt++) {
    cookie = ''
    const res = await api('POST', '/api/auth/sign-in/email', { email, password })
    if (res?.token) { sessions.set(email, cookie); return }
    if (attempt === 3) throw new Error(`gagal login: ${res?.message}`)
    await new Promise(r => setTimeout(r, 20_000))
  }
}

/** Jadwal yang seluruh harinya sudah lewat / belum mulai, dalam zona waktu event. */
function schedulesFor(openTime, closeTime) {
  return Array.from({ length: 7 }, (_, d) => ({ dayOfWeek: d, openTime, closeTime, isClosed: false }))
}

/** Jam sekarang di WIB, digeser sekian menit, sebagai "HH:MM". */
function wibTime(offsetMinutes = 0) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date())
  const hour = Number(parts.find(p => p.type === 'hour').value)
  const minute = Number(parts.find(p => p.type === 'minute').value)
  const total = Math.max(1, Math.min(1438, hour * 60 + minute + offsetMinutes))
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

async function main() {
  await login('superadmin@antrean.local')
  const stamp = Date.now()
  const createdEvents = []

  async function makeEvent(name, status, schedules) {
    const id = (await api('POST', '/api/admin/events', { name: `${name} ${stamp}`, timezone: 'Asia/Jakarta' })).data.id
    createdEvents.push(id)
    await api('PUT', `/api/admin/events/${id}/schedules`, { schedules })
    await api('POST', `/api/admin/events/${id}/status`, { status })
    return id
  }

  try {
    // ================= 1. HEADER KEAMANAN (§36) =================
    const headRes = await fetch(`${BASE}/api/health`, { headers: { Origin: BASE } })
    const csp = headRes.headers.get('content-security-policy') ?? ''
    record('header keamanan terpasang pada respons',
      headRes.headers.get('x-content-type-options') === 'nosniff'
      && headRes.headers.get('x-frame-options') === 'SAMEORIGIN'
      && !!headRes.headers.get('referrer-policy')
      && csp.includes(`default-src 'self'`)
      && csp.includes(`object-src 'none'`),
      'nosniff, SAMEORIGIN, referrer-policy, CSP')

    record('respons API tidak boleh singgah di cache',
      headRes.headers.get('cache-control') === 'no-store',
      headRes.headers.get('cache-control'))

    const pageRes = await fetch(`${BASE}/login`)
    record('halaman HTML juga membawa CSP',
      (pageRes.headers.get('content-security-policy') ?? '').includes(`frame-ancestors 'self'`),
      'frame-ancestors terkunci')

    // ================= 2. CSRF / ORIGIN =================
    const noOrigin = await fetch(`${BASE}/api/auth/sign-in/email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'sec-fetch-mode': 'cors' },
      body: JSON.stringify({ email: 'superadmin@antrean.local', password: 'password123' }),
    })
    record('permintaan lintas asal tanpa Origin ditolak', noOrigin.status === 403, `HTTP ${noOrigin.status}`)

    // ================= 3. RATE LIMIT PUBLIK (§36) =================
    const rlEvent = await makeEvent('Uji Rate Limit', 'OPEN', schedulesFor('00:00', '23:59'))
    const rlType = (await api('POST', '/api/admin/queue-types', {
      eventId: rlEvent, code: 'RL', name: 'Layanan RL', prefix: 'RL', startingNumber: 1,
      numberFormat: '{prefix}{seq}', padding: 3, color: '#1b5cf5', isActive: true, displayOrder: 1, estServiceSeconds: 300,
    })).data
    const rlPage = (await api('POST', '/api/admin/public-pages', {
      eventId: rlEvent, title: 'RateLimit', allowedQueueTypeIds: [], maxPerIpPerDay: 0, requireCaptcha: false,
    })).data
    await api('POST', `/api/admin/public-pages/${rlPage.id}/publish`, { isPublished: true })

    const burstIp = `203.0.113.${(stamp % 200) + 10}`
    let limited = 0
    let accepted = 0
    for (let i = 0; i < 26; i++) {
      const res = await fetch(`${BASE}/api/public/${rlPage.publishCode}/queue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Origin': BASE, 'X-Forwarded-For': burstIp },
        body: JSON.stringify({ queueTypeId: rlType.id, values: {} }),
      }).then(r => r.json())
      if (res.code === 'RATE_LIMITED') limited++
      else if (res.success) accepted++
    }
    record('satu IP yang membanjiri endpoint publik direm',
      limited > 0 && accepted > 0,
      `${accepted} diterima, ${limited} ditolak rate limit`)

    // ================= 4. PENJADWAL TUTUP OTOMATIS (§10) =================
    // Jadwal harian yang jam tutupnya sudah lewat satu menit lalu.
    const closingEvent = await makeEvent('Uji Auto Close', 'OPEN', schedulesFor('00:00', wibTime(-1)))
    // Event sekali jalan: hanya satu hari layanan, dan hari itu sudah lewat jam tutupnya.
    const finalEvent = await makeEvent('Uji Tutup Final', 'OPEN', schedulesFor('00:00', wibTime(-1)).map((row, day) => ({
      ...row,
      isClosed: day !== new Date().getDay(),
    })))
    // Jadwal yang sedang berlangsung, event masih SCHEDULED.
    const openingEvent = await makeEvent('Uji Auto Open', 'SCHEDULED', schedulesFor(wibTime(-60), wibTime(60)))
    // Jadwal yang belum mulai: event OPEN lebih awal tidak boleh ditutup paksa.
    const earlyEvent = await makeEvent('Uji Buka Lebih Awal', 'OPEN', schedulesFor(wibTime(60), wibTime(120)))

    const run = await api('POST', '/api/admin/scheduler/run')
    record('penjadwal berjalan dan memeriksa event', run.success && run.data.checked >= 4,
      `${run.data?.checked} event diperiksa, ${run.data?.closed.length} ditutup, ${run.data?.opened.length} dibuka`)

    const after = await api('GET', '/api/admin/events')
    const statusOf = id => after.data.find(e => e.id === id)?.status

    /**
     * Penutupan HARIAN mengembalikan status ke SCHEDULED, bukan CLOSED — kalau tidak,
     * layanan yang seharusnya berjalan setiap hari berhenti selamanya setelah satu
     * kali tutup, karena pembukaan otomatis hanya menyentuh event SCHEDULED.
     */
    record('event yang melewati jam tutup kembali menunggu jadwal berikutnya',
      statusOf(closingEvent) === 'SCHEDULED', `status=${statusOf(closingEvent)}`)

    record('event tanpa hari layanan lain benar-benar ditutup',
      statusOf(finalEvent) === 'CLOSED', `status=${statusOf(finalEvent)}`)
    record('event terjadwal dibuka otomatis saat masuk jam layanan',
      statusOf(openingEvent) === 'OPEN', `status=${statusOf(openingEvent)}`)
    record('event yang sengaja dibuka lebih awal tidak ditutup paksa',
      statusOf(earlyEvent) === 'OPEN', `status=${statusOf(earlyEvent)}`)

    const rerun = await api('POST', '/api/admin/scheduler/run')
    record('menjalankan penjadwal dua kali tidak mengubah apa pun lagi',
      rerun.data.opened.length === 0 && rerun.data.closed.length === 0,
      'idempoten')

    // Penjadwal bisa dimatikan lewat pengaturan sistem
    await api('PUT', '/api/admin/settings', { values: { 'queue.autoClose': false } })
    const offEvent = await makeEvent('Uji Auto Close Mati', 'OPEN', schedulesFor('00:00', wibTime(-1)))
    const offRun = await api('POST', '/api/admin/scheduler/run')
    const afterOff = await api('GET', '/api/admin/events')
    record('tutup otomatis menghormati pengaturan sistem',
      afterOff.data.find(e => e.id === offEvent)?.status === 'OPEN' && offRun.data.closed.length === 0,
      'event tetap OPEN saat autoClose dimatikan')

    await api('PUT', '/api/admin/settings', { values: { 'queue.autoClose': true } })

    /**
     * Siklus harian: event yang tadi kembali SCHEDULED harus terbuka lagi begitu jam
     * layanannya tiba. Inilah yang membuktikan tutup-otomatis tidak mematikan layanan
     * harian untuk selamanya.
     */
    await api('PUT', `/api/admin/events/${closingEvent}/schedules`, { schedules: schedulesFor(wibTime(-30), wibTime(30)) })
    const reopenRun = await api('POST', '/api/admin/scheduler/run')
    const afterReopen = await api('GET', '/api/admin/events')
    record('event yang menunggu jadwal dibuka lagi saat jam layanan tiba',
      afterReopen.data.find(e => e.id === closingEvent)?.status === 'OPEN' && reopenRun.data.opened.length >= 1,
      `status=${afterReopen.data.find(e => e.id === closingEvent)?.status}`)

    // ================= 5. UNGGAHAN (§36) =================
    const fakeImage = new FormData()
    // Berkas .png yang isinya sebenarnya skrip — harus ditolak berdasarkan magic byte.
    fakeImage.append('file', new Blob(['<?php system($_GET["c"]); ?>'], { type: 'image/png' }), 'gambar.png')
    const uploadRes = await fetch(`${BASE}/api/admin/media`, {
      method: 'POST',
      headers: { Origin: BASE, cookie },
      body: fakeImage,
    }).then(r => r.json())
    record('berkas menyamar sebagai gambar ditolak',
      !uploadRes.success, uploadRes.message)

    // ================= 6. AKSES TANPA IZIN =================
    const adminCookie = cookie
    await login('operator1@antrean.local')
    const forbidden = await api('GET', '/api/admin/settings')
    const forbiddenScheduler = await api('POST', '/api/admin/scheduler/run')
    cookie = adminCookie
    record('operator tidak bisa menyentuh endpoint admin',
      forbidden.code === 'FORBIDDEN' && forbiddenScheduler.code === 'FORBIDDEN',
      `${forbidden.code} / ${forbiddenScheduler.code}`)
  }
  finally {
    await login('superadmin@antrean.local').catch(() => {})
    await api('PUT', '/api/admin/settings', { values: { 'queue.autoClose': true } }).catch(() => {})
    /**
     * Antrean uji dibatalkan lebih dulu: event yang masih punya antrean aktif memang
     * tidak boleh dihapus, dan tanpa langkah ini tiap jalan uji meninggalkan event
     * menggantung yang mengotori jalan berikutnya.
     */
    for (const id of createdEvents) {
      const qs = await api('GET', `/api/admin/queues?eventId=${id}&perPage=200`).catch(() => null)
      for (const q of qs?.data?.items ?? []) {
        if (['WAITING', 'CALLED', 'SERVING'].includes(q.status)) {
          await api('POST', `/api/operator/queue/${q.id}/cancel`, { reason: 'Pembersihan uji' }).catch(() => {})
        }
      }
      await api('DELETE', `/api/admin/events/${id}`).catch(() => {})
    }
  }

  const failed = results.filter(r => !r.ok)
  console.log(`\n${results.length - failed.length}/${results.length} lolos`)
  process.exit(failed.length ? 1 : 0)
}

main().catch((e) => { console.error('CRASH', e); process.exit(2) })
