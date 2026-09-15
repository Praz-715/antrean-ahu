/**
 * Uji beban ringan (§54 Phase 8): 200 display tersambung + 2.000 antrean sehari.
 *
 * Bukan uji beban sungguhan dengan puluhan mesin — tujuannya memastikan angka yang
 * disebut spesifikasi memang tertangani satu instance, dan menunjukkan di mana
 * batasnya bila nanti dinaikkan.
 *
 * Jalankan: npm run load-test            (server dev harus sudah berjalan)
 *           QUEUES=500 DISPLAYS=50 npm run load-test
 */
import { io } from 'socket.io-client'

import { headerCaptcha } from './captcha.mjs'

/** Alamat server yang diuji; timpa dengan SMOKE_BASE untuk menguji hasil build. */
const BASE = process.env.SMOKE_BASE || 'http://localhost:3000'
const TOTAL_QUEUES = Number(process.env.QUEUES || 2000)
const TOTAL_DISPLAYS = Number(process.env.DISPLAYS || 200)
const CONCURRENCY = Number(process.env.CONCURRENCY || 25)

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

function percentile(sorted, p) {
  if (!sorted.length) return 0
  const index = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))
  return sorted[index]
}

function summarize(label, samples) {
  const sorted = [...samples].sort((a, b) => a - b)
  const total = samples.reduce((s, v) => s + v, 0)
  console.log(
    `${label}: n=${samples.length} `
    + `rata-rata=${(total / samples.length).toFixed(1)}ms `
    + `p50=${percentile(sorted, 50).toFixed(0)}ms `
    + `p95=${percentile(sorted, 95).toFixed(0)}ms `
    + `maks=${sorted.at(-1)?.toFixed(0)}ms`,
  )
  return { p50: percentile(sorted, 50), p95: percentile(sorted, 95) }
}

/** Jalankan tugas dengan batas paralel — meniru banyak pengunjung, bukan satu antrean panjang. */
async function pool(items, limit, worker) {
  const results = []
  let cursor = 0
  await Promise.all(Array.from({ length: limit }, async () => {
    while (cursor < items.length) {
      const index = cursor++
      results[index] = await worker(items[index], index)
    }
  }))
  return results
}

async function main() {
  console.log(`Target: ${TOTAL_QUEUES} antrean, ${TOTAL_DISPLAYS} display, paralel ${CONCURRENCY}\n`)

  const login = await api('POST', '/api/auth/sign-in/email', {
    email: 'superadmin@antrean.local',
    password: 'password123',
  })
  if (!login.token) { console.error('login gagal:', login.message); process.exit(1) }

  const stamp = Date.now()
  const eventId = (await api('POST', '/api/admin/events', { name: `Uji Beban ${stamp}`, timezone: 'Asia/Jakarta' })).data.id
  await api('PUT', `/api/admin/events/${eventId}/schedules`, {
    schedules: Array.from({ length: 7 }, (_, d) => ({ dayOfWeek: d, openTime: '00:00', closeTime: '23:59', isClosed: false })),
  })
  await api('POST', `/api/admin/events/${eventId}/status`, { status: 'OPEN' })

  const queueTypes = []
  for (let i = 0; i < 5; i++) {
    queueTypes.push((await api('POST', '/api/admin/queue-types', {
      eventId, code: `L${i}`, name: `Layanan ${i + 1}`, prefix: `L${i}`, startingNumber: 1,
      numberFormat: '{prefix}{seq}', padding: 4, color: '#1b5cf5', isActive: true, displayOrder: i, estServiceSeconds: 300,
    })).data)
  }
  const counter = (await api('POST', '/api/admin/counters', { eventId, code: 'LB1', name: 'Loket Beban', isActive: true, displayOrder: 1 })).data

  const page = (await api('POST', '/api/admin/public-pages', {
    eventId, title: 'Uji Beban', allowedQueueTypeIds: [], maxPerIpPerDay: 0, requireCaptcha: false,
  })).data
  await api('POST', `/api/admin/public-pages/${page.id}/publish`, { isPublished: true })

  const sockets = []
  /** Operator uji yang dibuat skrip ini — dihapus lagi saat bersih-bersih. */
  const createdOperatorIds = []
  try {
    // ---------- 1. Sambungkan display ----------
    console.log(`Memasangkan & menyambungkan ${TOTAL_DISPLAYS} display…`)
    const devices = await pool(Array.from({ length: TOTAL_DISPLAYS }), 10, async (_, i) => {
      const device = (await api('POST', '/api/admin/displays', {
        eventId, name: `Layar Beban ${i + 1}`, type: 'GLOBAL',
      })).data
      const paired = await api('POST', `/api/display/${device.deviceCode}/pair`)
      return { deviceCode: device.deviceCode, token: paired.data?.deviceToken }
    })

    const connectStart = Date.now()
    let connected = 0
    let rejected = 0
    const received = []

    await Promise.all(devices.map(device => new Promise((resolve) => {
      const socket = io(BASE, {
        path: '/socket.io',
        auth: { role: 'display', deviceCode: device.deviceCode, deviceToken: device.token },
        transports: ['websocket'],
        reconnection: false,
        extraHeaders: { Origin: BASE },
      })
      sockets.push(socket)

      const timer = setTimeout(() => { resolve() }, 30_000)
      socket.on('connect', () => { connected++; clearTimeout(timer); resolve() })
      socket.on('error', () => { rejected++; clearTimeout(timer); resolve() })
      socket.on('connect_error', () => { clearTimeout(timer); resolve() })
      // Payload panggilan membawa calledAt; itu dipakai mengukur jeda sampai ke layar.
      socket.on('queue.called', (payload) => {
        const sentAt = payload?.calledAt ?? payload?.lastCalledAt
        const lag = sentAt ? Date.now() - new Date(sentAt).getTime() : 0
        received.push(Number.isFinite(lag) && lag >= 0 ? lag : 0)
      })
    })))

    console.log(`  tersambung ${connected}/${TOTAL_DISPLAYS} dalam ${((Date.now() - connectStart) / 1000).toFixed(1)} detik`
      + (rejected ? ` (${rejected} ditolak)` : ''))

    // ---------- 2. Terbitkan antrean ----------
    console.log(`\nMenerbitkan ${TOTAL_QUEUES} antrean…`)
    const latencies = []
    let failed = 0
    const issueStart = Date.now()

    await pool(Array.from({ length: TOTAL_QUEUES }), CONCURRENCY, async (_, i) => {
      const queueType = queueTypes[i % queueTypes.length]
      const started = Date.now()
      const res = await fetch(`${BASE}/api/public/${page.publishCode}/queue`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': BASE,
          // Tiap pengunjung datang dari IP berbeda, seperti di dunia nyata —
          // sekaligus membuat rate limit per-IP tidak salah menghakimi uji ini.
          'X-Forwarded-For': `10.${Math.floor(i / 65025) % 256}.${Math.floor(i / 255) % 256}.${(i % 254) + 1}`,
        },
        body: JSON.stringify({ queueTypeId: queueType.id, values: {} }),
      }).then(r => r.json()).catch(() => null)

      if (res?.success) latencies.push(Date.now() - started)
      else failed++
    })

    const issueSeconds = (Date.now() - issueStart) / 1000
    console.log(`  selesai dalam ${issueSeconds.toFixed(1)} detik `
      + `(${(latencies.length / issueSeconds).toFixed(1)} antrean/detik, gagal ${failed})`)
    summarize('  latensi pembuatan antrean', latencies)

    // ---------- 3. Nomor duplikat? ----------
    const history = await api('GET', `/api/admin/queues?eventId=${eventId}&limit=1`)
    console.log(`  total tercatat: ${history.data?.total ?? '?'} antrean`)

    // ---------- 4. Sebaran broadcast ke display ----------
    console.log(`\nMengukur penyebaran panggilan ke ${connected} display…`)
    // Operator khusus untuk event uji ini (§28: satu operator satu event).
    const operatorEmail = `op.uji.${stamp}@antrean.local`
    const operatorRoleId = (await api('GET', '/api/admin/users')).data.roles.find(r => r.key === 'OPERATOR').id
    const operator = (await api('POST', '/api/admin/users', {
      name: `Operator Uji ${stamp}`,
      email: operatorEmail,
      password: 'password123',
      roleId: operatorRoleId,
      isActive: true,
    })).data
    createdOperatorIds.push(operator.id)
    await api('PUT', `/api/admin/counters/${counter.id}/services`, { queueTypeIds: [queueTypes[0].id] })
    await api('POST', '/api/admin/assignments', { userId: operator.id, counterId: counter.id })

    const adminCookie = cookie
    await api('POST', '/api/auth/sign-in/email', { email: operatorEmail, password: 'password123' })
    received.length = 0
    const callStart = Date.now()
    const called = await api('POST', '/api/operator/queue/next', { queueTypeId: queueTypes[0].id, counterId: counter.id })
    const callDuration = Date.now() - callStart
    cookie = adminCookie

    await new Promise(r => setTimeout(r, 3000))
    console.log(`  panggil NEXT: ${callDuration}ms (${called.data?.queueNumber ?? 'gagal'})`)
    console.log(`  layar menerima siaran: ${received.length}/${connected}`)
    if (received.length) summarize('  jeda siaran sampai ke layar', received)

    // ---------- 5. Baca papan display saat penuh ----------
    const stateSamples = []
    for (let i = 0; i < 10; i++) {
      const started = Date.now()
      await fetch(`${BASE}/api/display/${devices[i % devices.length].deviceCode}/state`, {
        headers: { Origin: BASE },
      }).then(r => r.json())
      stateSamples.push(Date.now() - started)
    }
    summarize('  latensi baca status display', stateSamples)

    console.log('\nSelesai. Bersih-bersih…')
  }
  finally {
    for (const socket of sockets) socket.close()
    await api('POST', '/api/auth/sign-in/email', { email: 'superadmin@antrean.local', password: 'password123' }).catch(() => {})

    /**
     * Antrean aktif harus dibatalkan lebih dulu.
     *
     * Event yang masih punya antrean WAITING/CALLED/SERVING menolak dihapus (memang
     * begitu seharusnya), dan uji ini menerbitkan ribuan antrean — tanpa langkah ini
     * event uji beban tertinggal di database beserta seluruh antreannya.
     */
    let cleared = 0
    for (;;) {
      const batch = await api('GET', `/api/admin/queues?eventId=${eventId}&perPage=200`).catch(() => null)
      const active = (batch?.data?.items ?? []).filter(q => ['WAITING', 'CALLED', 'SERVING'].includes(q.status))
      if (!active.length) break
      for (let i = 0; i < active.length; i += 25) {
        await Promise.all(active.slice(i, i + 25).map(q =>
          api('POST', `/api/operator/queue/${q.id}/cancel`, { reason: 'Pembersihan uji beban' }).catch(() => {})))
      }
      cleared += active.length
      process.stdout.write(`\r  membatalkan antrean uji: ${cleared}`)
    }
    if (cleared) console.log(`\r  membatalkan antrean uji: ${cleared} selesai`)

    for (const operatorId of createdOperatorIds) {
      await api('DELETE', `/api/admin/users/${operatorId}`).catch(() => {})
    }
    const removed = await api('DELETE', `/api/admin/events/${eventId}`).catch(() => null)
    console.log(removed?.success ? '  event uji dihapus' : '  ⚠️  event uji GAGAL dihapus — periksa manual')
  }
}

main().catch((e) => { console.error('CRASH', e); process.exit(2) })
