import { headerCaptcha } from './captcha.mjs'

/** Alamat server yang diuji; timpa dengan SMOKE_BASE untuk menguji hasil build. */
const BASE = process.env.SMOKE_BASE || 'http://localhost:3000'
let cookie = ''
const call = async (m, p, b) => {
  const r = await fetch(BASE + p, {
    method: m,
    headers: { ...(await headerCaptcha(BASE, p)), 'Content-Type': 'application/json', Origin: BASE, ...(cookie ? { cookie } : {}) },
    ...(b ? { body: JSON.stringify(b) } : {}),
  })
  const sc = r.headers.getSetCookie?.() ?? []
  if (sc.length) cookie = sc.map(c => c.split(';')[0]).join('; ')
  return r.json()
}

const login = await call('POST', '/api/auth/sign-in/email', { email: 'superadmin@antrean.local', password: 'password123' })
if (!login.token) { console.error('login gagal'); process.exit(1) }

const ev = await call('POST', '/api/admin/events', { name: 'Skala 10 Layanan ' + Date.now(), timezone: 'Asia/Jakarta', allowFinishAfterClose: true })
const eventId = ev.data.id
await call('POST', `/api/admin/events/${eventId}/status`, { status: 'OPEN' })
for (let i = 0; i < 10; i++) {
  await call('POST', '/api/admin/queue-types', {
    eventId, code: 'T' + i, name: 'Layanan ' + i, prefix: 'T' + i,
    startingNumber: 1, numberFormat: '{prefix}{seq}', padding: 3,
    color: '#1b5cf5', isActive: true, displayOrder: i, estServiceSeconds: 300,
  })
}
const dev = await call('POST', '/api/admin/displays', { eventId, name: 'Display Skala', type: 'GLOBAL' })
console.log('EVENT=' + eventId)
console.log('DEVICE=' + dev.data.deviceCode)
