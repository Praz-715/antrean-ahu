/**
 * Uji perilaku nyata di browser untuk hal-hal yang tidak bisa dibuktikan dari sisi server:
 * pairing display + realtime, teks berjalan, dan penyembunyian field HIDDEN.
 *
 * Skrip ini menyiapkan event uji sendiri (buka 24 jam) lalu membersihkannya, jadi
 * data demo tidak tersentuh dan hasilnya tidak bergantung pada hari/jam menjalankannya.
 *
 * Jalankan: npm run smoke:browser   (server dev harus sudah berjalan)
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

/**
 * Masuk sebagai pengguna tertentu.
 * Better Auth membatasi 30 percobaan per menit; skrip ini sering dijalankan tepat
 * setelah smoke-api, jadi sekali gagal ditunggu lalu diulang.
 */
const sessions = new Map()

async function login(email, password = 'password123') {
  // sesi yang sudah didapat dipakai ulang; login berulang bisa kena rate limit sendiri
  const saved = sessions.get(email)
  if (saved) { cookie = saved; return }

  for (let attempt = 1; attempt <= 3; attempt++) {
    cookie = ''
    const res = await api('POST', '/api/auth/sign-in/email', { email, password })
    if (res?.token) { sessions.set(email, cookie); return }
    if (attempt === 3) throw new Error(`gagal login sebagai ${email}: ${res?.message ?? 'tidak diketahui'}`)
    console.log(`  (login ${email} ditolak: ${res?.message ?? '?'} — menunggu 20 dtk)`)
    await new Promise(r => setTimeout(r, 20_000))
  }
}

/** Tunggu Nuxt selesai hidrasi — di mode dev, chunk halaman dikompilasi saat diminta. */
async function waitHydrated(page) {
  await page.waitForFunction(() => !!document.querySelector('#__nuxt')?.__vue_app__, null, { timeout: 30_000 })
  await page.waitForTimeout(500)
}

async function waitFor(fn, timeout = 15_000, interval = 300) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if (await fn()) return true
    await new Promise(r => setTimeout(r, interval))
  }
  return false
}

/** Event uji lengkap: buka setiap hari 24 jam supaya tidak bergantung kalender. */
async function setupFixture() {
  const stamp = Date.now()
  const eventId = (await api('POST', '/api/admin/events', {
    name: `Uji Browser ${stamp}`, timezone: 'Asia/Jakarta',
  })).data.id

  await api('PUT', `/api/admin/events/${eventId}/schedules`, {
    schedules: Array.from({ length: 7 }, (_, d) => ({
      dayOfWeek: d, openTime: '00:00', closeTime: '23:59', isClosed: false,
    })),
  })
  await api('POST', `/api/admin/events/${eventId}/status`, { status: 'OPEN' })

  const queueType = (await api('POST', '/api/admin/queue-types', {
    eventId, code: 'U', name: 'Layanan Uji', prefix: 'U', startingNumber: 1,
    numberFormat: '{prefix}{seq}', padding: 3, color: '#1b5cf5',
    isActive: true, displayOrder: 1, estServiceSeconds: 300,
  })).data

  const counter = (await api('POST', '/api/admin/counters', {
    eventId, code: 'UL1', name: 'Loket Uji', isActive: true, displayOrder: 1,
  })).data

  const operatorEmail = `op.uji.${stamp}@antrean.local`
  const roles = (await api('GET', '/api/admin/users')).data.roles
  const operator = (await api('POST', '/api/admin/users', {
    name: `Operator Uji ${stamp}`,
    email: operatorEmail,
    password: 'password123',
    roleId: roles.find(r => r.key === 'OPERATOR').id,
    isActive: true,
  })).data
  // Layanan melekat pada loket; operator mewarisinya dengan duduk di sana (§28).
  await api('PUT', `/api/admin/counters/${counter.id}/services`, { queueTypeIds: [queueType.id] })
  await api('POST', '/api/admin/assignments', { userId: operator.id, counterId: counter.id })

  const form = (await api('POST', '/api/admin/forms', { eventId, name: 'Form Uji' })).data
  await api('PUT', `/api/admin/forms/${form.id}/fields`, {
    fields: [
      { key: 'full_name', label: 'Nama Lengkap', type: 'TEXT', isRequired: true },
      { key: 'sumber_rahasia', label: 'Sumber Rahasia', type: 'HIDDEN', isRequired: false, defaultValue: 'qr-lobby' },
    ],
  })
  await api('POST', `/api/admin/forms/${form.id}/activate`)

  const publicPage = (await api('POST', '/api/admin/public-pages', {
    eventId, title: 'Halaman Uji', allowedQueueTypeIds: [], maxPerIpPerDay: 0, requireCaptcha: false,
  })).data
  await api('POST', `/api/admin/public-pages/${publicPage.id}/publish`, { isPublished: true })

  const display = (await api('POST', '/api/admin/displays', {
    eventId, name: 'Display Uji', type: 'GLOBAL',
  })).data

  return {
    eventId,
    queueType,
    counter,
    // Operator milik event ini sendiri (§28) — bukan operator demo bersama.
    operatorEmail,
    operatorId: operator.id,
    publishCode: publicPage.publishCode,
    deviceCode: display.deviceCode,
  }
}

async function main() {
  await login('superadmin@antrean.local')
  const fx = await setupFixture()

  const browser = await chromium.launch()
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } })
  const page = await context.newPage()

  try {
    // ---- 1. kunjungan pertama: pairing + socket tersambung ----
    await page.goto(`${BASE}/display/${fx.deviceCode}`, { waitUntil: 'domcontentloaded' })
    await waitHydrated(page)
    const onlineFirst = await waitFor(async () => (await page.locator('header').innerText()).includes('ONLINE'))
    const token = await page.evaluate(code => localStorage.getItem(`antrean:display-token:${code}`), fx.deviceCode)
    record('display kunjungan pertama: pairing + ONLINE', onlineFirst && !!token,
      onlineFirst ? `token tersimpan (${String(token).slice(0, 8)}…)` : 'tidak pernah ONLINE')

    // ---- 2. kunjungan kedua saat sudah dipasangkan — inilah bug A1 ----
    await page.reload({ waitUntil: 'domcontentloaded' })
    await waitHydrated(page)
    const onlineSecond = await waitFor(async () => (await page.locator('header').innerText()).includes('ONLINE'))
    record('display sesudah dipasangkan: tetap ONLINE', onlineSecond,
      onlineSecond
        ? 'socket tersambung memakai token tersimpan'
        : (await page.locator('header').innerText()).replace(/\s+/g, ' ').slice(0, 80))

    // ---- 2b. tombol layar penuh (§17) ----
    /**
     * Layar antrean dipasang di televisi, jadi tombol ini bagian dari pemasangan.
     * Keluarnya diuji lewat `exitFullscreen()` — bukan tombol — karena begitulah
     * yang terjadi saat pengguna menekan Esc: statusnya harus ikut tersinkron dari
     * event `fullscreenchange`, bukan dari klik.
     */
    const fsButton = page.getByRole('button', { name: /layar penuh/i }).first()
    let fullscreenOk = false
    if (await fsButton.count()) {
      /**
       * Labelnya DITUNGGU, bukan dibaca sekali: status fullscreen peramban berubah
       * lebih dulu daripada render Vue berikutnya, jadi pembacaan langsung setelah
       * `exitFullscreen()` masih menangkap label lama.
       */
      const labelOf = async () => (await fsButton.textContent())?.trim() ?? ''

      await fsButton.click()
      const entered = await waitFor(async () => page.evaluate(() => !!document.fullscreenElement), 8_000)
      const labelIn = await waitFor(async () => /keluar/i.test(await labelOf()), 8_000)

      await page.evaluate(() => document.exitFullscreen()).catch(() => {})
      const exited = await waitFor(async () => page.evaluate(() => !document.fullscreenElement), 8_000)
      const labelOut = await waitFor(async () => !/keluar/i.test(await labelOf()), 8_000)

      fullscreenOk = entered && exited && labelIn && labelOut
    }
    record('display bisa masuk & keluar layar penuh', fullscreenOk,
      fullscreenOk ? 'label ikut berubah mengikuti status peramban' : 'tombol tidak ada atau status tidak tersinkron')

    // ---- 2c. panggilan prioritas tampil khusus di layar (§57) ----
    /**
     * Penandanya dicari lewat `data-priority-badge`, bukan teks: badge memuat ikon,
     * jadi pencocokan berbasis teks daun akan melewatkannya — persis kesalahan yang
     * sempat membuat fitur ini tampak tidak jalan padahal sudah benar.
     */
    const priorityBadges = () => page.locator('[data-priority-badge]').count()
    const badgeBeforePriority = await priorityBadges()

    // ---- 3. pengunjung mengambil antrean ----
    const visitor = await context.newPage()
    await visitor.goto(`${BASE}/p/${fx.publishCode}`, { waitUntil: 'domcontentloaded' })
    await waitHydrated(visitor)
    // Kartu layanan: yang diklik tombol "Ambil Nomor" di dalam kartunya
    await visitor.locator('article').filter({ hasText: fx.queueType.name }).first()
      .getByRole('button').first().click()
    await visitor.locator('form').waitFor({ timeout: 15_000 })

    const formText = await visitor.locator('form').innerText()
    record('field HIDDEN tidak tampil ke pengunjung', !formText.includes('Sumber Rahasia'),
      formText.includes('Sumber Rahasia') ? 'masih tampil sebagai input' : 'tersembunyi seperti seharusnya')

    await visitor.locator('form input[type="text"]').first().fill('Pengunjung Uji')
    await visitor.locator('form button[type="submit"]').click()
    await visitor.waitForURL(/\/queue\//, { timeout: 20_000 })
    // nomor baru muncul setelah halaman tiket selesai mengambil datanya
    const gotTicket = await waitFor(async () => /U\d{3}/.test(await visitor.locator('body').innerText()), 20_000)
    const ticketText = await visitor.locator('body').innerText()
    record('pengunjung mendapat tiket antrean', gotTicket,
      (ticketText.match(/U\d{3}/) ?? ['tidak ada nomor'])[0])

    // ---- 4. operator memanggil → layar & tiket ikut berubah ----
    await login(fx.operatorEmail)
    const next = await api('POST', '/api/operator/queue/next', {
      queueTypeId: fx.queueType.id, counterId: fx.counter.id,
    })
    const called = next.data?.queueNumber

    const onDisplay = called
      ? await waitFor(async () => (await page.locator('main').innerText()).includes(called))
      : false
    record('nomor dipanggil muncul di layar tanpa reload', onDisplay, called ?? next.message)

    record('panggilan biasa TIDAK menampilkan penanda prioritas',
      (await priorityBadges()) === badgeBeforePriority,
      `${await priorityBadges()} penanda di layar`)

    const onTicket = called
      ? await waitFor(async () => (await visitor.locator('body').innerText()).toLowerCase().includes('dipanggil'))
      : false
    record('halaman pengunjung ikut berubah tanpa reload', onTicket,
      onTicket ? 'status menjadi dipanggil' : 'tidak berubah')

    // ---- 5. umpan balik loading pada aksi ----
    const admin = await context.newPage()
    await admin.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
    await waitHydrated(admin)
    await masukLewatUi(admin, BASE, 'superadmin@antrean.local')
    await admin.waitForURL(/\/admin\//, { timeout: 30_000 })

    // perlambat API supaya indikator sempat teramati (hanya selama uji ini)
    let slowApi = true
    await admin.route('**/api/admin/**', async (route) => {
      if (slowApi) await new Promise(r => setTimeout(r, 700))
      await route.continue()
    })

    let barSeen = false
    const barPoll = setInterval(async () => {
      const has = await admin.evaluate(() => !!document.querySelector('.nuxt-loading-indicator')).catch(() => false)
      if (has) barSeen = true
    }, 60)

    await admin.goto(`${BASE}/admin/displays`, { waitUntil: 'domcontentloaded' })
    await waitHydrated(admin)
    await admin.waitForTimeout(1200)
    clearInterval(barPoll)
    record('bilah progres muncul saat memuat data', barSeen, barSeen ? 'NuxtLoadingIndicator aktif' : 'tidak terlihat')

    const resetButton = admin.locator('button', { hasText: 'Reset Pairing' }).first()
    let spinnerSeen = false
    if (await resetButton.count()) {
      await resetButton.click()
      spinnerSeen = await waitFor(async () => (await resetButton.locator('.animate-spin').count()) > 0, 3_000, 50)
      await admin.waitForTimeout(1200)
    }
    record('tombol aksi menampilkan spinner sendiri', spinnerSeen,
      spinnerSeen ? 'UiActionButton berputar selama aksi' : 'spinner tidak muncul')

    // ---- 6. seluruh halaman admin benar-benar terender di browser ----
    // Beberapa galat hanya muncul saat hidrasi (mis. item select bernilai kosong
    // yang ditolak Nuxt UI), jadi SSR 200 saja tidak cukup sebagai bukti.
    const ADMIN_ROUTES = [
      '/admin/dashboard', '/admin/analytics', '/admin/reports', '/admin/audit-logs',
      '/admin/live-queue', '/admin/queue-history', '/admin/media', '/admin/display-builder',
      '/admin/displays', '/admin/assignments', '/admin/announcements', '/admin/forms',
      '/admin/public-pages', '/admin/operators', '/admin/queue-types', '/admin/counters',
      '/admin/visitors', '/admin/feedback', '/admin/integrations', '/admin/settings',
      '/admin/roles',
    ]
    slowApi = false
    const broken = []
    const placeholders = []
    for (const route of ADMIN_ROUTES) {
      await admin.goto(BASE + route, { waitUntil: 'domcontentloaded' })
      await admin.waitForTimeout(900)
      const body = await admin.evaluate(() => document.body.innerText)
      const hasMain = (await admin.locator('main').count()) > 0
      if (!hasMain || body.includes('Internal Server Error')) {
        broken.push(`${route} (${body.slice(0, 50).replace(/\s+/g, ' ')})`)
      }
      // Halaman yang masih berupa "coming soon" tidak boleh lolos sebagai selesai.
      if (body.includes('Bagian ini belum dibangun')) placeholders.push(route)
    }
    record('semua halaman admin terender di browser', broken.length === 0,
      broken.length ? broken.join(' | ') : `${ADMIN_ROUTES.length} halaman bersih`)

    record('tidak ada halaman admin yang masih placeholder', placeholders.length === 0,
      placeholders.length ? placeholders.join(', ') : 'seluruh menu sudah berisi')

    await admin.close()

    // ---- 7. pengumuman sampai ke teks berjalan ----
    await login('superadmin@antrean.local')
    const pesan = `Istirahat pukul 12.00 - 13.00 (${Date.now().toString().slice(-4)})`
    const announcement = await api('POST', '/api/admin/announcements', {
      eventId: fx.eventId, message: pesan, type: 'RUNNING_TEXT', priority: 5,
    })
    const onFooter = announcement.success
      ? await waitFor(async () => (await page.locator('footer').innerText()).includes(pesan))
      : false
    record('pengumuman muncul di teks berjalan display', onFooter,
      onFooter ? 'tanpa reload' : announcement.message)

    // ---- 8. panggilan prioritas: penanda khusus di layar (§57) ----
    const extra = await api('POST', `/api/public/${fx.publishCode}/queue`, {
      queueTypeId: fx.queueType.id,
      values: { full_name: 'Pengunjung Prioritas' },
    })
    const priorityQueueId = extra.data?.token
      ? (await api('GET', `/api/admin/queues?eventId=${fx.eventId}&perPage=50`))
          .data.items.find(q => q.queueNumber === extra.data.queueNumber)?.id
      : null

    let priorityOk = false
    if (priorityQueueId) {
      await login(fx.operatorEmail)
      const prio = await api('POST', `/api/operator/queue/${priorityQueueId}/call`, {
        counterId: fx.counter.id,
        priority: true,
      })
      priorityOk = prio.success
        && prio.data?.priority >= 10
        && await waitFor(async () => (await priorityBadges()) > badgeBeforePriority, 15_000)
    }
    record('panggilan prioritas menampilkan penanda khusus di layar', priorityOk,
      priorityOk ? `${extra.data?.queueNumber} ditandai PRIORITAS tanpa reload` : 'penanda tidak muncul')

    await visitor.close()
  }
  finally {
    await browser.close()
    await login('superadmin@antrean.local').catch(() => {})

    /**
     * Antrean aktif dibatalkan lebih dulu — event yang masih punya antrean berjalan
     * memang tidak boleh dihapus, dan tanpa langkah ini tiap jalan uji meninggalkan
     * event menggantung. Operator uji ikut dihapus supaya daftar pengguna tidak
     * menumpuk.
     */
    const leftovers = await api('GET', `/api/admin/queues?eventId=${fx.eventId}&perPage=200`).catch(() => null)
    for (const q of leftovers?.data?.items ?? []) {
      if (['WAITING', 'CALLED', 'SERVING'].includes(q.status)) {
        await api('POST', `/api/operator/queue/${q.id}/cancel`, { reason: 'Pembersihan uji' }).catch(() => {})
      }
    }
    await api('DELETE', `/api/admin/events/${fx.eventId}`).catch(() => {})
    if (fx.operatorId) await api('DELETE', `/api/admin/users/${fx.operatorId}`).catch(() => {})
  }

  const failed = results.filter(r => !r.ok)
  console.log(`\n${results.length - failed.length}/${results.length} lolos`)
  process.exit(failed.length ? 1 : 0)
}

main().catch((e) => { console.error('CRASH', e); process.exit(2) })
