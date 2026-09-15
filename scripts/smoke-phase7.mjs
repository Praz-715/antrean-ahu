/**
 * Uji Phase 7: pengaturan sistem, rating & testimoni, integrasi sumber data,
 * autofill formulir, notifikasi, dan cetak tiket.
 *
 * Skrip menyalakan server HTTP kecil sebagai "sistem eksternal" palsu, memakai
 * event uji sendiri, lalu membersihkan seluruh jejaknya.
 *
 * Jalankan: npm run smoke:phase7   (server dev harus sudah berjalan)
 */
import { createServer } from 'node:http'
import { chromium } from 'playwright'

import { headerCaptcha, masukLewatUi } from './captcha.mjs'

/** Alamat server yang diuji; timpa dengan SMOKE_BASE untuk menguji hasil build. */
const BASE = process.env.SMOKE_BASE || 'http://localhost:3000'
const STUB_PORT = 4599
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

/** Permintaan publik tidak boleh membawa cookie admin. */
async function publicApi(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', Origin: BASE },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
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

const today = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date())

/**
 * "Sistem rumah sakit" tiruan. Sengaja mengembalikan field rahasia yang TIDAK
 * dipetakan, supaya bisa dibuktikan bahwa autofill publik tidak membocorkannya.
 */
function startStub() {
  const server = createServer((req, res) => {
    const url = new URL(req.url, `http://localhost:${STUB_PORT}`)
    const match = url.pathname.match(/^\/patient\/(.+)$/)

    if (!match || match[1] !== '0012345') {
      res.writeHead(404, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ message: 'tidak ditemukan' }))
      return
    }

    if (req.headers['x-api-key'] !== 'kunci-rahasia') {
      res.writeHead(401, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ message: 'api key salah' }))
      return
    }

    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({
      status: 'ok',
      data: {
        patient: {
          name: 'siti aminah',
          birthDate: '1990-04-17T00:00:00.000Z',
          phone: '+62 812-3456-7890',
          diagnosisRahasia: 'JANGAN PERNAH BOCOR',
        },
      },
    }))
  })
  return new Promise(resolve => server.listen(STUB_PORT, '127.0.0.1', () => resolve(server)))
}

async function main() {
  const stub = await startStub()
  await login('superadmin@antrean.local')

  const stamp = Date.now()
  const eventId = (await api('POST', '/api/admin/events', { name: `Uji Phase7 ${stamp}`, timezone: 'Asia/Jakarta' })).data.id
  await api('PUT', `/api/admin/events/${eventId}/schedules`, {
    schedules: Array.from({ length: 7 }, (_, d) => ({ dayOfWeek: d, openTime: '00:00', closeTime: '23:59', isClosed: false })),
  })
  await api('POST', `/api/admin/events/${eventId}/status`, { status: 'OPEN' })

  const queueType = (await api('POST', '/api/admin/queue-types', {
    eventId, code: 'F', name: 'Layanan Umpan Balik', prefix: 'F', startingNumber: 1,
    numberFormat: '{prefix}{seq}', padding: 3, color: '#1b5cf5', isActive: true, displayOrder: 1, estServiceSeconds: 300,
  })).data
  const counter = (await api('POST', '/api/admin/counters', { eventId, code: 'FL1', name: 'Loket Umpan Balik', isActive: true, displayOrder: 1 })).data
  const page = (await api('POST', '/api/admin/public-pages', {
    eventId, title: 'Phase7', allowedQueueTypeIds: [], maxPerIpPerDay: 0, requireCaptcha: false,
  })).data
  await api('POST', `/api/admin/public-pages/${page.id}/publish`, { isPublished: true })

  const form = (await api('POST', '/api/admin/forms', { eventId, name: 'Formulir Phase7' })).data
  await api('PUT', `/api/admin/forms/${form.id}/fields`, {
    fields: [
      { key: 'no_rm', label: 'Nomor Rekam Medis', type: 'TEXT', isRequired: true },
      { key: 'nama_lengkap', label: 'Nama Lengkap', type: 'TEXT', isRequired: false },
      { key: 'tanggal_lahir', label: 'Tanggal Lahir', type: 'DATE', isRequired: false },
      { key: 'no_hp', label: 'Nomor HP', type: 'PHONE', isRequired: false },
    ],
  })
  await api('POST', `/api/admin/forms/${form.id}/activate`)

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

  const createdSources = []

  try {
    // ================= 1. PENGATURAN SISTEM (§49) =================
    await api('POST', '/api/admin/settings/reset')
    const defaults = await api('GET', '/api/admin/settings')
    record('pengaturan mengembalikan katalog lengkap dengan nilai bawaan',
      !!defaults.success && defaults.data['queue.recallLimit'] === 3 && defaults.data['feedback.ratingEnabled'] === true,
      `${Object.keys(defaults.data ?? {}).length} kunci`)

    const saved = await api('PUT', '/api/admin/settings', {
      values: {
        'queue.recallLimit': 1,
        'feedback.autoApprove': false,
        'kunci.tidak.dikenal': 'abaikan saya',
        'queue.numberLength': 99,
      },
    })
    record('pengaturan tersimpan, kunci asing diabaikan, angka dijepit',
      saved.data['queue.recallLimit'] === 1
      && saved.data['queue.numberLength'] === 6
      && !('kunci.tidak.dikenal' in saved.data),
      `recallLimit=${saved.data['queue.recallLimit']}, numberLength=${saved.data['queue.numberLength']}`)

    // ================= 2. RATING & TESTIMONI (§23) =================
    const take = async () => publicApi('POST', `/api/public/${page.publishCode}/queue`, { queueTypeId: queueType.id, values: { no_rm: '0012345' } })

    const first = await take()
    record('pengunjung mendapat nomor antrean', !!first.success, first.data?.queueNumber ?? first.code)
    const token = first.data.token

    const tooEarly = await publicApi('POST', `/api/public/track/${token}/testimonial`, { rating: 5 })
    record('penilaian ditolak sebelum layanan selesai', tooEarly.code === 'QUEUE_INVALID_TRANSITION', tooEarly.message)

    const adminCookie = cookie
    await login(operatorEmail)
    const called = await api('POST', '/api/operator/queue/next', { queueTypeId: queueType.id, counterId: counter.id })
    await api('POST', `/api/operator/queue/${called.data.id}/serving`, {})
    await api('POST', `/api/operator/queue/${called.data.id}/complete`, {})
    cookie = adminCookie

    const rated = await publicApi('POST', `/api/public/track/${token}/testimonial`, { rating: 5, comment: 'Pelayanan cepat dan ramah.' })
    record('penilaian diterima setelah selesai dan menunggu moderasi',
      rated.success && rated.data.rating === 5 && rated.data.isApproved === false,
      rated.success ? `rating ${rated.data.rating}, disetujui=${rated.data.isApproved}` : rated.message)

    const twice = await publicApi('POST', `/api/public/track/${token}/testimonial`, { rating: 1 })
    record('satu antrean hanya bisa dinilai sekali', twice.code === 'CONFLICT', twice.message)

    const track = await publicApi('GET', `/api/public/track/${token}`)
    record('halaman pelacakan menampilkan penilaian yang sudah dikirim',
      track.data?.testimonial?.rating === 5 && track.data?.ratingEnabled === true,
      `testimonial=${track.data?.testimonial?.rating}`)

    const list = await api('GET', `/api/admin/testimonials?eventId=${eventId}&from=${today}&to=${today}`)
    record('daftar moderasi memuat testimoni beserta rekap',
      list.data.total === 1 && list.data.summary.average === 5 && list.data.summary.pending === 1
      && list.data.summary.satisfactionRate === 100,
      `total=${list.data.total}, rata-rata=${list.data.summary.average}, menunggu=${list.data.summary.pending}`)

    const testimonialId = list.data.items[0].id
    const approved = await api('PATCH', `/api/admin/testimonials/${testimonialId}`, { isApproved: true })
    record('moderasi menyetujui testimoni', approved.success && approved.data.isApproved === true, approved.message)

    const pendingOnly = await api('GET', `/api/admin/testimonials?eventId=${eventId}&status=pending`)
    record('penyaring status bekerja', pendingOnly.data.total === 0, `menunggu=${pendingOnly.data.total}`)

    const exportJob = (await api('POST', '/api/admin/exports', {
      type: 'TESTIMONIALS', format: 'CSV', eventId, from: today, to: today,
    })).data
    const exportReady = await waitFor(async () => {
      const jobs = await api('GET', '/api/admin/exports')
      const job = jobs.data.find(j => j.id === exportJob.id)
      return job?.status === 'DONE' || job?.status === 'FAILED'
    })
    const exportList = await api('GET', '/api/admin/exports')
    const exportDone = exportList.data.find(j => j.id === exportJob.id)
    let exportBody = ''
    if (exportDone?.status === 'DONE') {
      exportBody = await fetch(`${BASE}/api/admin/exports/${exportJob.id}/download`, { headers: { cookie } }).then(r => r.text())
    }
    record('ekspor testimoni menghasilkan berkas berisi data',
      exportReady && exportDone?.status === 'DONE' && exportBody.includes('Pelayanan cepat'),
      `${exportDone?.status}, ${exportDone?.rowCount ?? 0} baris`)

    // ================= 3. BATAS DARI PENGATURAN =================
    const second = await take()
    await login(operatorEmail)
    const called2 = await api('POST', '/api/operator/queue/next', { queueTypeId: queueType.id, counterId: counter.id })
    const recall1 = await api('POST', `/api/operator/queue/${called2.data.id}/recall`, {})
    const recall2 = await api('POST', `/api/operator/queue/${called2.data.id}/recall`, {})
    cookie = adminCookie
    record('batas panggil ulang mengikuti pengaturan sistem',
      recall1.success && recall2.code === 'RECALL_LIMIT_REACHED',
      `panggil ulang ke-2 ditolak: ${recall2.message}`)
    void second

    await api('PUT', '/api/admin/settings', { values: { 'queue.maxWaiting': 1 } })
    const quotaType = (await api('POST', '/api/admin/queue-types', {
      eventId, code: 'Q', name: 'Layanan Kuota', prefix: 'Q', startingNumber: 1,
      numberFormat: '{prefix}{seq}', padding: 3, color: '#dc2626', isActive: true, displayOrder: 2, estServiceSeconds: 300,
    })).data
    const q1 = await publicApi('POST', `/api/public/${page.publishCode}/queue`, { queueTypeId: quotaType.id, values: { no_rm: '1' } })
    const q2 = await publicApi('POST', `/api/public/${page.publishCode}/queue`, { queueTypeId: quotaType.id, values: { no_rm: '2' } })
    record('kuota antrean menunggu dari pengaturan sistem ditegakkan',
      q1.success && q2.code === 'QUEUE_LIMIT_REACHED', q2.message)
    await api('PUT', '/api/admin/settings', { values: { 'queue.maxWaiting': 0 } })

    await api('PUT', '/api/admin/settings', { values: { 'queue.publicRegistration': false } })
    const blocked = await take()
    const pageOff = await publicApi('GET', `/api/public/${page.publishCode}`)
    record('pendaftaran mandiri bisa dimatikan menyeluruh',
      blocked.code === 'REGISTRATION_DISABLED' && pageOff.data.features.publicRegistration === false,
      blocked.message)
    await api('PUT', '/api/admin/settings', { values: { 'queue.publicRegistration': true } })

    await api('PUT', '/api/admin/settings', { values: { 'feedback.ratingEnabled': false } })
    const trackOff = await publicApi('GET', `/api/public/track/${token}`)
    record('rating bisa dimatikan dari pengaturan', trackOff.data.ratingEnabled === false, 'ratingEnabled=false')
    await api('PUT', '/api/admin/settings', { values: { 'feedback.ratingEnabled': true } })

    // ================= 4. INTEGRASI SUMBER DATA (§6) =================
    const source = (await api('POST', '/api/admin/data-sources', {
      name: `SIMRS Uji ${stamp}`,
      type: 'REST',
      baseUrl: `http://127.0.0.1:${STUB_PORT}/patient/{lookup}`,
      httpMethod: 'GET',
      authType: 'API_KEY',
      credentials: { authType: 'API_KEY', in: 'header', name: 'X-API-Key', value: 'kunci-rahasia' },
      headers: {},
      queryTemplate: { lookupFieldKey: 'no_rm', rootPath: 'data', query: {}, body: {} },
      timeoutMs: 5000,
      isActive: true,
      mappings: [
        { sourcePath: 'patient.name', targetFieldKey: 'nama_lengkap', transform: 'capitalize' },
        { sourcePath: 'patient.birthDate', targetFieldKey: 'tanggal_lahir', transform: 'date' },
        { sourcePath: 'patient.phone', targetFieldKey: 'no_hp', transform: 'digits' },
        { sourcePath: 'patient.diagnosisRahasia', targetFieldKey: 'diagnosis', transform: 'none' },
      ],
    })).data
    createdSources.push(source.id)

    record('kredensial tidak pernah dikembalikan ke klien',
      source.hasCredentials === true && !('credentialsCipher' in source)
      && !JSON.stringify(source).includes('kunci-rahasia'),
      'hanya penanda hasCredentials')

    const test = (await api('POST', `/api/admin/data-sources/${source.id}/test`, { lookup: '0012345' })).data
    record('uji koneksi berhasil dan memetakan respons',
      test.ok && test.status === 200 && test.mapped.nama_lengkap === 'Siti Aminah'
      && test.mapped.tanggal_lahir === '1990-04-17' && test.mapped.no_hp === '6281234567890',
      `HTTP ${test.status} dalam ${test.durationMs} ms`)

    const blockedSource = (await api('POST', '/api/admin/data-sources', {
      name: `Metadata Cloud ${stamp}`,
      type: 'REST',
      baseUrl: 'http://169.254.169.254/latest/meta-data/',
      httpMethod: 'GET',
      authType: 'NONE',
      headers: {},
      queryTemplate: { query: {}, body: {} },
      timeoutMs: 2000,
      isActive: true,
      mappings: [],
    })).data
    createdSources.push(blockedSource.id)
    const blockedTest = (await api('POST', `/api/admin/data-sources/${blockedSource.id}/test`, { lookup: '' })).data
    record('URL ke jaringan internal ditolak penjaga SSRF',
      !blockedTest.ok && /internal/i.test(blockedTest.error ?? ''),
      blockedTest.error)

    // ================= 5. AUTOFILL PUBLIK =================
    await api('PATCH', `/api/admin/forms/${form.id}`, { dataSourceId: source.id })

    const pageWithAutofill = await publicApi('GET', `/api/public/${page.publishCode}`)
    record('halaman publik menyebut field pemicu autofill',
      pageWithAutofill.data.form.autofillFieldKey === 'no_rm',
      `pemicu=${pageWithAutofill.data.form.autofillFieldKey}`)

    const filled = await publicApi('POST', `/api/public/${page.publishCode}/autofill`, { lookup: '0012345' })
    const payload = JSON.stringify(filled.data ?? {})
    record('autofill mengisi field formulir',
      filled.success && filled.data.nama_lengkap === 'Siti Aminah' && filled.data.no_hp === '6281234567890',
      payload.slice(0, 90))

    record('autofill tidak membocorkan field di luar formulir',
      !('diagnosis' in (filled.data ?? {})) && !payload.includes('JANGAN PERNAH BOCOR'),
      'field diagnosisRahasia tidak ikut terkirim')

    const notFound = await publicApi('POST', `/api/public/${page.publishCode}/autofill`, { lookup: '9999999' })
    record('autofill menjawab rapi saat data tidak ada', notFound.code === 'AUTOFILL_NOT_FOUND', notFound.message)

    // ================= 6. TAMPILAN =================
    const browser = await chromium.launch()
    const view = await browser.newPage()
    const consoleErrors = []
    view.on('pageerror', e => consoleErrors.push(e.message.split('\n')[0]))
    view.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text().split('\n')[0]) })

    await view.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
    await view.waitForFunction(() => !!document.querySelector('#__nuxt')?.__vue_app__, null, { timeout: 30_000 })
    await masukLewatUi(view, BASE, 'superadmin@antrean.local')
    await view.waitForURL(/\/admin\//, { timeout: 30_000 })
    await view.evaluate(id => localStorage.setItem('antrean:current-event', id), eventId)

    for (const [path, marker] of [
      ['/admin/settings', 'Pengaturan Sistem'],
      ['/admin/feedback', 'Rating & Testimoni'],
      ['/admin/integrations', 'Integrasi Sumber Data'],
    ]) {
      consoleErrors.length = 0
      await view.goto(BASE + path, { waitUntil: 'domcontentloaded' })
      await view.waitForFunction(() => !!document.querySelector('#__nuxt')?.__vue_app__, null, { timeout: 30_000 })
      const heading = await view.locator('h1').first().textContent().catch(() => '')
      record(`halaman ${path} terender tanpa error`,
        (heading ?? '').trim() === marker && consoleErrors.length === 0,
        consoleErrors[0] ?? (heading ?? '').trim())

      // Kontrol pengaturan dihitung selagi halamannya memang sedang terbuka.
      if (path === '/admin/settings') {
        const switchCount = await view.locator('[role="switch"]').count()
        record('halaman pengaturan merender kontrol dari katalog', switchCount >= 6, `${switchCount} sakelar`)
      }
    }

    await view.goto(`${BASE}/admin/feedback`, { waitUntil: 'domcontentloaded' })
    await view.waitForFunction(() => !!document.querySelector('#__nuxt')?.__vue_app__, null, { timeout: 30_000 })
    const commentShown = await waitFor(async () =>
      (await view.getByText('Pelayanan cepat dan ramah.').count()) > 0, 15_000)
    record('testimoni tampil di halaman moderasi', commentShown, 'komentar pengunjung terlihat')

    const visitor = await browser.newPage()
    await visitor.goto(`${BASE}/queue/${token}`, { waitUntil: 'domcontentloaded' })
    await visitor.waitForFunction(() => !!document.querySelector('#__nuxt')?.__vue_app__, null, { timeout: 30_000 })
    const printVisible = await visitor.getByRole('button', { name: /Cetak/ }).count()
    const ratingShown = await visitor.getByText('Penilaian Anda sudah kami terima').count()
    record('halaman pengunjung punya tombol cetak dan menampilkan penilaiannya',
      printVisible > 0 && ratingShown > 0, `tombol cetak=${printVisible}`)

    // Pengunjung yang belum menilai melihat form bintang
    const fresh = await take()
    await login(operatorEmail)
    const freshCalled = await api('POST', '/api/operator/queue/next', { queueTypeId: queueType.id, counterId: counter.id })
    await api('POST', `/api/operator/queue/${freshCalled.data.id}/complete`, {})
    cookie = adminCookie

    await visitor.goto(`${BASE}/queue/${fresh.data.token}`, { waitUntil: 'domcontentloaded' })
    await visitor.waitForFunction(() => !!document.querySelector('#__nuxt')?.__vue_app__, null, { timeout: 30_000 })
    const starsShown = await waitFor(async () =>
      (await visitor.getByText('Bagaimana pengalaman Anda?').count()) > 0, 15_000)
    const starButtons = await visitor.locator('button[aria-label*="bintang"]').count()
    record('form bintang muncul untuk antrean yang baru selesai',
      starsShown && starButtons === 5, `${starButtons} bintang`)

    await browser.close()

    // ================= 7. NOTIFIKASI (§47) =================
    const audit = await api('GET', '/api/admin/audit-logs?limit=50')
    const hasSettingLog = audit.data.items.some(l => l.action === 'SETTING_CHANGED')
    const hasSourceLog = audit.data.items.some(l => l.action === 'DATA_SOURCE_CREATED')
    const leaks = JSON.stringify(audit.data.items).includes('kunci-rahasia')
    record('perubahan pengaturan & integrasi tercatat di audit tanpa kredensial',
      hasSettingLog && hasSourceLog && !leaks,
      `SETTING_CHANGED=${hasSettingLog}, DATA_SOURCE_CREATED=${hasSourceLog}`)
  }
  finally {
    await login('superadmin@antrean.local').catch(() => {})
    for (const id of createdSources) await api('DELETE', `/api/admin/data-sources/${id}`).catch(() => {})
    await api('POST', '/api/admin/settings/reset').catch(() => {})
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
    stub.close()
  }

  const failed = results.filter(r => !r.ok)
  console.log(`\n${results.length - failed.length}/${results.length} lolos`)
  process.exit(failed.length ? 1 : 0)
}

main().catch((e) => { console.error('CRASH', e); process.exit(2) })
