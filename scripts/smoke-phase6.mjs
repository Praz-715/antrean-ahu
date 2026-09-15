/**
 * Uji Phase 6: analytics, laporan harian, pusat ekspor, audit log.
 *
 * Menyiapkan event uji berisi antrean pada beberapa hari, lalu membersihkannya.
 * Jalankan: npm run smoke:phase6   (server dev harus sudah berjalan)
 */
import { chromium } from 'playwright'

import { headerCaptcha, masukLewatUi } from './captcha.mjs'

/** Alamat server yang diuji; timpa dengan SMOKE_BASE untuk menguji hasil build. */
const BASE = process.env.SMOKE_BASE || 'http://localhost:3000'
const results = []

function record(name, ok, detail) {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'OK  ' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
}

let cookie = ''
async function api(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { ...(await headerCaptcha(BASE, path)), 'Content-Type': 'application/json', Origin: BASE, ...(cookie ? { cookie } : {}) },
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

async function waitFor(fn, timeout = 20_000, interval = 400) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if (await fn()) return true
    await new Promise(r => setTimeout(r, interval))
  }
  return false
}

// tanggal layanan mengikuti zona waktu event (WIB), bukan UTC — sama seperti aplikasi
const today = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date())

function shift(date, days) {
  const d = new Date(`${date}T00:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

async function main() {
  await login('superadmin@antrean.local')

  const stamp = Date.now()
  const eventId = (await api('POST', '/api/admin/events', { name: `Uji Phase6 ${stamp}`, timezone: 'Asia/Jakarta' })).data.id
  await api('PUT', `/api/admin/events/${eventId}/schedules`, {
    schedules: Array.from({ length: 7 }, (_, d) => ({ dayOfWeek: d, openTime: '00:00', closeTime: '23:59', isClosed: false })),
  })
  await api('POST', `/api/admin/events/${eventId}/status`, { status: 'OPEN' })

  const queueType = (await api('POST', '/api/admin/queue-types', {
    eventId, code: 'R', name: 'Layanan Laporan', prefix: 'R', startingNumber: 1,
    numberFormat: '{prefix}{seq}', padding: 3, color: '#1b5cf5', isActive: true, displayOrder: 1, estServiceSeconds: 300,
  })).data
  const counter = (await api('POST', '/api/admin/counters', { eventId, code: 'RL1', name: 'Loket Laporan', isActive: true, displayOrder: 1 })).data
  const page = (await api('POST', '/api/admin/public-pages', {
    eventId, title: 'Phase6', allowedQueueTypeIds: [], maxPerIpPerDay: 0, requireCaptcha: false,
  })).data
  await api('POST', `/api/admin/public-pages/${page.id}/publish`, { isPublished: true })

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
  await api('PUT', `/api/admin/counters/${counter.id}/services`, { queueTypeIds: [queueType.id] })
  await api('POST', '/api/admin/assignments', { userId: operator.id, counterId: counter.id })

  try {
    // ---- siapkan data: 4 antrean, 2 diselesaikan lewat operator ----
    const taken = []
    for (let i = 0; i < 4; i++) {
      const res = await fetch(`${BASE}/api/public/${page.publishCode}/queue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: BASE },
        body: JSON.stringify({ queueTypeId: queueType.id, values: {} }),
      }).then(r => r.json())
      taken.push(res.success ? res.data.queueNumber : `GAGAL(${res.code})`)
    }
    record('empat antrean uji berhasil dibuat', taken.every(t => !t.startsWith('GAGAL')), taken.join(', '))

    const adminCookie = cookie
    await login(operatorEmail)
    const first = await api('POST', '/api/operator/queue/next', { queueTypeId: queueType.id, counterId: counter.id })
    await api('POST', `/api/operator/queue/${first.data.id}/serving`, {})
    await api('POST', `/api/operator/queue/${first.data.id}/complete`, {})
    const second = await api('POST', '/api/operator/queue/next', { queueTypeId: queueType.id, counterId: counter.id })
    await api('POST', `/api/operator/queue/${second.data.id}/skip`, {})
    cookie = adminCookie

    // ---- 1. analytics ----
    const analytics = await api('GET', `/api/admin/analytics?eventId=${eventId}&from=${shift(today, -6)}&to=${today}`)
    const a = analytics.data
    record('analytics mengembalikan agregat lengkap',
      !!analytics.success && a.totals.queues === 4 && a.daily.length === 7 && a.byQueueType.length === 1,
      analytics.success ? `${a.totals.queues} antrean, ${a.daily.length} titik tren, ${a.operators.length} operator` : analytics.message)

    record('rata-rata layanan hanya dari antrean yang dilayani',
      a.averages.servedCount === 1,
      `servedCount=${a.averages.servedCount} (1 selesai lewat SERVING, 1 dilewati)`)

    const hourSum = a.hourly.reduce((s, h) => s + h.count, 0)
    record('sebaran jam memakai zona waktu event', hourSum === 4,
      `total ${hourSum} pada jam ${a.hourly.map(h => h.hour).join(',')} WIB`)

    // ---- 2. laporan harian ----
    const daily = await api('GET', `/api/admin/reports/daily?eventId=${eventId}&date=${today}`)
    record('laporan harian tersusun', !!daily.success && daily.data.totals.queues === 4,
      daily.success ? `jam tersibuk ${daily.data.busiestHour?.hour}:00, ${daily.data.byOperator.length} operator` : daily.message)

    // ---- 3. ekspor CSV ----
    const csvJob = (await api('POST', '/api/admin/exports', {
      type: 'QUEUES', format: 'CSV', eventId, from: shift(today, -6), to: today,
    })).data

    const csvReady = await waitFor(async () => {
      const list = await api('GET', '/api/admin/exports')
      const job = list.data.find(j => j.id === csvJob.id)
      return job?.status === 'DONE' || job?.status === 'FAILED'
    })
    const csvList = await api('GET', '/api/admin/exports')
    const csvDone = csvList.data.find(j => j.id === csvJob.id)
    record('ekspor CSV diproses di latar belakang', csvReady && csvDone?.status === 'DONE',
      csvDone ? `${csvDone.status}, ${csvDone.rowCount} baris` : 'tidak selesai')

    const csvRes = await fetch(`${BASE}/api/admin/exports/${csvJob.id}/download`, { headers: { cookie, Origin: BASE } })
    // .text() membuang BOM otomatis, jadi byte mentahnya yang diperiksa
    const csvBuf = Buffer.from(await csvRes.arrayBuffer())
    const hasBom = csvBuf[0] === 0xEF && csvBuf[1] === 0xBB && csvBuf[2] === 0xBF
    const csvLines = csvBuf.toString('utf8').replace(/^\uFEFF/, '').trim().split(/\r\n/)
    const csvOk = csvRes.status === 200
      && hasBom
      && csvLines[0].includes('Jenis Antrean')
      && csvLines.length === 5 // 1 header + 4 antrean
    record('berkas CSV terunduh dengan BOM & isi benar', csvOk,
      `HTTP ${csvRes.status}, BOM=${hasBom}, ${csvLines.length - 1} baris data`)

    // ---- 4. ekspor XLSX ----
    const xlsxJob = (await api('POST', '/api/admin/exports', {
      type: 'OPERATORS', format: 'XLSX', eventId, from: shift(today, -6), to: today,
    })).data
    await waitFor(async () => {
      const list = await api('GET', '/api/admin/exports')
      return ['DONE', 'FAILED'].includes(list.data.find(j => j.id === xlsxJob.id)?.status)
    })
    const xlsxRes = await fetch(`${BASE}/api/admin/exports/${xlsxJob.id}/download`, { headers: { cookie, Origin: BASE } })
    const xlsxBuf = Buffer.from(await xlsxRes.arrayBuffer())
    // XLSX adalah arsip ZIP: dua byte pertama 'PK'
    const xlsxOk = xlsxRes.status === 200 && xlsxBuf[0] === 0x50 && xlsxBuf[1] === 0x4B && xlsxBuf.length > 2000
    record('berkas XLSX terunduh sebagai arsip Excel sah', xlsxOk,
      `HTTP ${xlsxRes.status}, ${xlsxBuf.length} byte, magic ${xlsxBuf.subarray(0, 2).toString('ascii')}`)

    // ---- 5. rentang tanggal terbalik ditolak ----
    const badRange = await api('POST', '/api/admin/exports', {
      type: 'QUEUES', format: 'CSV', eventId, from: today, to: shift(today, -5),
    })
    record('rentang tanggal terbalik ditolak', !badRange.success, badRange.code ?? 'lolos (salah!)')

    // ---- 6. audit log ----
    const audit = await api('GET', '/api/admin/audit-logs?perPage=20')
    const hasExportAction = audit.data?.items?.some(i => i.action === 'EXPORT_REQUESTED')
    record('audit log mencatat aktivitas & menyediakan filter',
      !!audit.success && audit.data.total > 0 && hasExportAction && audit.data.filters.actions.length > 0,
      audit.success ? `${audit.data.total} entri, ${audit.data.filters.actions.length} jenis aksi` : audit.message)

    const filtered = await api('GET', '/api/admin/audit-logs?action=EXPORT_REQUESTED')
    record('filter audit log bekerja',
      !!filtered.success && filtered.data.items.every(i => i.action === 'EXPORT_REQUESTED') && filtered.data.items.length > 0,
      `${filtered.data?.items?.length ?? 0} entri EXPORT_REQUESTED`)

    // ---- 7. halaman analytics benar-benar menggambar chart ----
    const browser = await chromium.launch()
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    const view = await ctx.newPage()

    await view.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
    await view.waitForFunction(() => !!document.querySelector('#__nuxt')?.__vue_app__, null, { timeout: 30_000 })
    await masukLewatUi(view, BASE, 'superadmin@antrean.local')
    await view.waitForURL(/\/admin\//, { timeout: 30_000 })

    // arahkan ke event uji
    await view.evaluate(id => localStorage.setItem('antrean:current-event', id), eventId)
    await view.goto(`${BASE}/admin/analytics`, { waitUntil: 'domcontentloaded' })
    await view.waitForFunction(() => !!document.querySelector('#__nuxt')?.__vue_app__, null, { timeout: 30_000 })

    const canvasDrawn = await waitFor(async () => (await view.locator('canvas').count()) >= 3, 25_000)
    record('halaman analytics menggambar chart ECharts', canvasDrawn,
      `${await view.locator('canvas').count()} kanvas`)

    await view.goto(`${BASE}/admin/audit-logs`, { waitUntil: 'domcontentloaded' })
    await view.waitForFunction(() => !!document.querySelector('#__nuxt')?.__vue_app__, null, { timeout: 30_000 })
    const auditShown = await waitFor(async () => (await view.locator('tbody tr').count()) > 1, 20_000)
    record('halaman audit log menampilkan entri', auditShown,
      `${await view.locator('tbody tr').count()} baris`)

    await browser.close()
  }
  finally {
    await login('superadmin@antrean.local').catch(() => {})
      const leftovers = await api('GET', `/api/admin/queues?eventId=${eventId}&perPage=200`).catch(() => null)
      for (const q of leftovers?.data?.items ?? []) {
        if (['WAITING', 'CALLED', 'SERVING'].includes(q.status)) {
          await api('POST', `/api/operator/queue/${q.id}/cancel`, { reason: 'Pembersihan uji' }).catch(() => {})
        }
      }
    await api('DELETE', `/api/admin/events/${eventId}`).catch(() => {})
    /**
     * Operator uji ikut dihapus. Menghapus event saja tidak cukup — akunnya tetap
     * berdiri dan menumpuk di halaman Pengguna sebagai "Operator Uji" palsu.
     */
    await api('DELETE', `/api/admin/users/${operator.id}`).catch(() => {})
  }

  const failed = results.filter(r => !r.ok)
  console.log(`\n${results.length - failed.length}/${results.length} lolos`)
  process.exit(failed.length ? 1 : 0)
}

main().catch((e) => { console.error('CRASH', e); process.exit(2) })
