/**
 * Audit Function / UI / UX lewat peramban sungguhan.
 *
 * Berbeda dari skrip `smoke:*` yang menguji perilaku lewat API, berkas ini
 * MENGGERAKKAN ANTARMUKA seperti pengguna: mengeklik tombol, mengisi modal,
 * menggulir di lebar ponsel, menekan Tab. Yang dicari bukan hanya "apakah jalan",
 * tetapi juga hal-hal yang membuat aplikasi terasa kasar: tombol tanpa nama yang
 * bisa dibaca pembaca layar, halaman yang menggeser ke samping di ponsel, umpan
 * balik yang tidak muncul, dan pesan galat yang tidak menjelaskan apa pun.
 *
 * Jalankan: npm run ux-audit          (server dev harus sudah berjalan)
 *           HEADED=1 npm run ux-audit (lihat prosesnya)
 */
import { chromium } from 'playwright'

import { geserSampaiPas, headerCaptcha, masukLewatUi, pantauTekaTeki } from './captcha.mjs'

/** Alamat server yang diuji; timpa dengan SMOKE_BASE untuk menguji hasil build. */
const BASE = process.env.SMOKE_BASE || 'http://localhost:3000'
const findings = []
const passes = []

function pass(area, name, detail) {
  passes.push({ area, name, detail })
  console.log(`OK    [${area}] ${name}${detail ? '  — ' + detail : ''}`)
}

function fail(area, name, detail) {
  findings.push({ area, name, detail })
  console.log(`TEMUAN[${area}] ${name}${detail ? '  — ' + detail : ''}`)
}

function check(area, name, ok, detail) {
  if (ok) pass(area, name, detail)
  else fail(area, name, detail)
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

async function hydrated(page) {
  await page.waitForFunction(() => !!document.querySelector('#__nuxt')?.__vue_app__, null, { timeout: 30_000 })
}

async function waitFor(fn, timeout = 15_000, interval = 300) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if (await fn()) return true
    await new Promise(r => setTimeout(r, interval))
  }
  return false
}

const ADMIN_PAGES = [
  '/admin/dashboard', '/admin/live-queue', '/admin/queue-history', '/admin/queue-types',
  '/admin/counters', '/admin/operators', '/admin/assignments', '/admin/forms',
  '/admin/public-pages', '/admin/displays', '/admin/display-builder', '/admin/media',
  '/admin/announcements', '/admin/analytics', '/admin/reports', '/admin/audit-logs',
  '/admin/visitors', '/admin/feedback', '/admin/integrations', '/admin/settings',
  '/admin/roles', '/admin/events',
]

async function main() {
  // ---------- data uji sendiri (tidak menyentuh event demo) ----------
  /**
   * Login diberi beberapa kesempatan: menjalankan seluruh rangkaian uji berurutan
   * bisa menabrak rate limit login Better Auth (30/menit), dan kegagalan di sini
   * dulu muncul sebagai `Cannot read properties of null` beberapa baris kemudian —
   * pesan yang tidak menjelaskan apa pun.
   */
  for (let attempt = 1; attempt <= 3; attempt++) {
    cookie = ''
    const res = await api('POST', '/api/auth/sign-in/email', { email: 'superadmin@antrean.local', password: 'password123' })
    if (res?.token) break
    if (attempt === 3) throw new Error(`gagal login sebagai superadmin: ${res?.message ?? 'tanpa pesan'}`)
    console.log(`  catatan: login gagal (${res?.message ?? '?'}); menunggu 30 detik lalu mencoba lagi`)
    await new Promise(r => setTimeout(r, 30_000))
  }

  const stamp = Date.now()
  const createdEvent = await api('POST', '/api/admin/events', { name: `Audit UX ${stamp}`, timezone: 'Asia/Jakarta' })
  if (!createdEvent?.data?.id) {
    throw new Error(`gagal menyiapkan event uji: ${createdEvent?.code ?? '?'} - ${createdEvent?.message ?? 'tanpa pesan'}`)
  }
  const eventId = createdEvent.data.id
  await api('PUT', `/api/admin/events/${eventId}/schedules`, {
    schedules: Array.from({ length: 7 }, (_, d) => ({ dayOfWeek: d, openTime: '00:00', closeTime: '23:59', isClosed: false })),
  })
  await api('POST', `/api/admin/events/${eventId}/status`, { status: 'OPEN' })
  const runTag = String(stamp).slice(-5)
  const serviceName = `Layanan Audit ${runTag}`
  const queueType = (await api('POST', '/api/admin/queue-types', {
    eventId, code: `UX${runTag}`, name: serviceName, prefix: 'UX', startingNumber: 1,
    numberFormat: '{prefix}{seq}', padding: 3, color: '#1b5cf5', isActive: true, displayOrder: 1, estServiceSeconds: 300,
  })).data
  const counter = (await api('POST', '/api/admin/counters', { eventId, code: 'UXL', name: 'Loket Audit', isActive: true, displayOrder: 1 })).data
  const publicPage = (await api('POST', '/api/admin/public-pages', {
    eventId, title: 'Audit UX', subtitle: 'Silakan ambil nomor', allowedQueueTypeIds: [], maxPerIpPerDay: 0, requireCaptcha: false,
  })).data
  await api('POST', `/api/admin/public-pages/${publicPage.id}/publish`, { isPublished: true })
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

  /**
   * Panaskan setiap rute lewat HTTP dulu.
   *
   * Pada server dev, kunjungan pertama ke sebuah halaman memicu kompilasi Vite yang
   * bisa melewati 30 detik. Tanpa pemanasan, yang terukur adalah waktu kompilasi —
   * bukan pengalaman pengguna yang ingin dinilai.
   */
  process.stdout.write('Memanaskan rute')
  const adminCookieJar = cookie
  for (const path of [...ADMIN_PAGES, '/login', `/p/${publicPage.publishCode}`]) {
    await fetch(BASE + path, { headers: { cookie } }).catch(() => {})
    process.stdout.write('.')
  }
  // Rute operator dipanaskan dengan sesi operator, lalu sesi admin dipulihkan.
  await api('POST', '/api/auth/sign-in/email', { email: operatorEmail, password: 'password123' })
  await fetch(BASE + '/operator', { headers: { cookie } }).catch(() => {})
  process.stdout.write('.')
  cookie = adminCookieJar
  console.log(' selesai')

  const browser = await chromium.launch({ headless: !process.env.HEADED })
  const consoleErrors = []

  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    const page = await ctx.newPage()
    // Server dev bisa lambat pada kompilasi pertama; jangan salah menuduhnya rusak.
    page.setDefaultTimeout(45_000)
    page.setDefaultNavigationTimeout(60_000)
    page.on('pageerror', e => consoleErrors.push(`${page.url().replace(BASE, '')} :: ${e.message.split('\n')[0].slice(0, 120)}`))
    page.on('console', m => {
      if (m.type() === 'error') consoleErrors.push(`${page.url().replace(BASE, '')} :: ${m.text().split('\n')[0].slice(0, 120)}`)
    })

    // ==================================================================
    // A. FUNGSI LEWAT ANTARMUKA
    // ==================================================================
    console.log('\n--- A. Fungsi lewat antarmuka ---')

    // A1. Kredensial salah harus dijelaskan, bukan gagal diam-diam
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
    await hydrated(page)

    /**
     * Captcha geser muncul lebih dulu, bahkan untuk kata sandi yang salah (§36).
     * Idnya disadap dari respons karena memang tidak pernah ada di DOM.
     */
    const tekaTeki = pantauTekaTeki(page)

    /**
     * Status tiap percobaan masuk direkam sejak awal. Rate limit Better Auth
     * (30/menit) menjawab dengan pesan "terlalu banyak percobaan" yang wajar tetapi
     * bukan pesan kredensial salah — tanpa membedakan keduanya, audit melaporkan
     * cacat antarmuka padahal yang terjadi hanyalah audit dijalankan beruntun.
     */
    const signInCalls = []
    page.on('response', (res) => {
      if (res.url().includes('/api/auth/sign-in')) signInCalls.push(res.status())
    })

    async function pesanGagalTampil() {
      return waitFor(async () => {
        const text = await page.locator('body').innerText()
        return /salah|tidak valid|gagal|invalid/i.test(text)
      }, 15_000)
    }

    await page.locator('input[type="email"]').fill('superadmin@antrean.local')
    await page.locator('input[type="password"]').fill('sandi-yang-salah')
    await page.locator('button[type="submit"]').click()
    await geserSampaiPas(page, BASE, tekaTeki)
    let errorShown = await pesanGagalTampil()
    if (!errorShown && signInCalls.includes(429)) {
      console.log('  catatan: login dibatasi rate limit (429); menunggu 60 detik lalu mencoba sekali lagi')
      await page.waitForTimeout(60_000)
      await page.locator('input[type="password"]').fill('sandi-yang-salah')
      await page.locator('button[type="submit"]').click()
      await geserSampaiPas(page, BASE, tekaTeki)
      errorShown = await pesanGagalTampil()
    }

    check('FUNGSI', 'login gagal menampilkan pesan yang bisa dipahami', errorShown,
      errorShown ? 'pesan galat tampil' : 'tidak ada pesan apa pun setelah login gagal')
    check('FUNGSI', 'login gagal tidak memindahkan pengguna dari halaman login',
      page.url().includes('/login'), page.url().replace(BASE, ''))

    // A2. Enter di kolom sandi harus mengirim formulir (bukan wajib klik tombol)
    await page.locator('input[type="password"]').fill('password123')
    await page.locator('input[type="password"]').press('Enter')
    await geserSampaiPas(page, BASE, tekaTeki)
    let loggedIn = await page.waitForURL(/\/admin\//, { timeout: 30_000 }).then(() => true).catch(() => false)

    /**
     * Menjalankan audit berulang kali dalam satu menit bisa menabrak rate limit
     * login Better Auth (30/menit). Itu keadaan lingkungan, bukan cacat antarmuka.
     * Dikenali dari STATUS respons, bukan dari teksnya — teks bisa berubah bahasa,
     * status 429 tidak.
     */
    const rateLimited = !loggedIn && signInCalls.includes(429)
    if (rateLimited) {
      console.log('  catatan: login dibatasi rate limit (429); menunggu 60 detik lalu mencoba sekali lagi')
      await page.waitForTimeout(60_000)
      await page.locator('input[type="password"]').fill('password123')
      await page.locator('input[type="password"]').press('Enter')
      await geserSampaiPas(page, BASE, tekaTeki)
      loggedIn = await page.waitForURL(/\/admin\//, { timeout: 30_000 }).then(() => true).catch(() => false)
    }
    check('UX', 'Enter di formulir login langsung mengirim', loggedIn, page.url().replace(BASE, ''))

    if (!loggedIn) {
      await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
      await hydrated(page)
      await masukLewatUi(page, BASE, 'superadmin@antrean.local')
      await page.waitForURL(/\/admin\//, { timeout: 30_000 })
    }

    await page.evaluate(id => localStorage.setItem('antrean:current-event', id), eventId)

    // A3. CRUD jenis antrean sepenuhnya lewat modal
    await page.goto(`${BASE}/admin/queue-types`, { waitUntil: 'domcontentloaded' })
    await hydrated(page)
    const addButton = page.getByRole('button', { name: /Tambah Jenis Antrean/ }).first()
    const hasAdd = await waitFor(async () => (await addButton.count()) > 0, 20_000)
    check('UI', 'halaman jenis antrean menyediakan tombol tambah', hasAdd)

    if (hasAdd) {
      await addButton.click()
      await page.waitForTimeout(900)

      const modalVisible = await page.getByRole('dialog').count()
      check('UI', 'modal jenis antrean terbuka', modalVisible > 0, `${modalVisible} dialog`)

      // Diisi lewat placeholder, bukan urutan kolom: urutan bisa berubah kapan saja.
      await page.getByPlaceholder('A', { exact: true }).first().fill('AUDIT2')
      await page.getByPlaceholder('Pelayanan Umum').fill('Layanan Audit Dua')
      const prefixField = page.getByPlaceholder('A', { exact: true }).nth(1)
      if (await prefixField.count()) await prefixField.fill('AD')

      // Verba tombol simpan berbeda antar-halaman (Tambah / Buat / Simpan) — terima semuanya.
      await page.getByRole('button', { name: /^(Tambah|Buat|Simpan|Simpan Perubahan)$/ }).last().click()

      const created = await waitFor(async () =>
        (await page.getByText('Layanan Audit Dua').count()) > 0, 20_000)
      check('FUNGSI', 'jenis antrean baru dibuat lewat antarmuka', created,
        created ? 'muncul di daftar' : 'tidak muncul setelah disimpan')

      const toastShown = await page.locator('[role="status"], [role="alert"], [data-sonner-toast]').count()
      check('UX', 'aksi berhasil memberi umpan balik (toast)', toastShown > 0, `${toastShown} elemen status`)

      // Hapus kembali lewat antarmuka: jalur hapus juga harus benar-benar bekerja.
      if (created) {
        const row = page.locator('div', { hasText: 'Layanan Audit Dua' })
        const menuButton = row.locator('button:has(.iconify)').last()
        if (await menuButton.count()) {
          await menuButton.click({ timeout: 10_000 }).catch(() => {})
          await page.waitForTimeout(600)
          const deleteItem = page.getByRole('menuitem', { name: /Hapus/ }).first()
          if (await deleteItem.count()) {
            await deleteItem.click()
            await page.waitForTimeout(700)
            const confirm = page.getByRole('button', { name: /^Hapus$/ }).last()
            if (await confirm.count()) await confirm.click()
            const removed = await waitFor(async () =>
              (await page.getByText('Layanan Audit Dua').count()) === 0, 20_000)
            check('FUNGSI', 'jenis antrean bisa dihapus lewat antarmuka', removed,
              removed ? 'hilang dari daftar' : 'masih tampil setelah dihapus')
          }
        }
      }
    }

    // A4. Simpan pengaturan lewat antarmuka & bertahan setelah reload
    await page.goto(`${BASE}/admin/settings`, { waitUntil: 'domcontentloaded' })
    await hydrated(page)
    await waitFor(async () => (await page.locator('[role="switch"]').count()) > 0)

    /**
     * Dibidik lewat baris berlabel, bukan "kolom angka pertama": kolom pertama
     * kebetulan "Panjang nomor antrean" yang maksimalnya 6, sehingga nilai uji 7
     * akan dijepit dan uji ini seolah gagal padahal aplikasinya benar.
     */
    const recallField = page.locator('[data-setting="queue.recallLimit"] input').first()
    const before = await recallField.inputValue().catch(() => '')

    /**
     * Isian diulang sampai bilah simpan muncul.
     *
     * Markup SSR halaman ini sudah lengkap sebelum `await load()` di setup selesai
     * di sisi klien, jadi `fill()` bisa mendahului hidrasi: nilainya masuk ke DOM
     * tapi tidak pernah sampai ke v-model. Yang diuji tetap perilaku aplikasi —
     * hanya momennya yang dibuat pasti.
     */
    const saveBarShown = await waitFor(async () => {
      await recallField.fill('7')
      await recallField.blur()
      return (await page.getByText(/pengaturan belum disimpan/i).count()) > 0
    }, 12_000, 600)
    check('UX', 'perubahan pengaturan memunculkan bilah simpan', saveBarShown,
      saveBarShown ? 'bilah mengambang muncul' : 'tidak ada penanda perubahan belum tersimpan')

    if (saveBarShown) {
      await page.getByRole('button', { name: /Simpan Perubahan/ }).click()
      await page.waitForTimeout(2500)
      await page.reload({ waitUntil: 'domcontentloaded' })
      await hydrated(page)
      await waitFor(async () => (await page.locator('[role="switch"]').count()) > 0)
      const after = await page.locator('[data-setting="queue.recallLimit"] input').first()
        .inputValue().catch(() => '')
      check('FUNGSI', 'pengaturan bertahan setelah halaman dimuat ulang', after === '7',
        `batas panggil ulang: sebelum=${before} → sesudah reload=${after}`)
    }

    // A5. Matriks izin role
    await page.goto(`${BASE}/admin/roles`, { waitUntil: 'domcontentloaded' })
    await hydrated(page)
    await waitFor(async () => (await page.locator('[role="checkbox"], input[type="checkbox"]').count()) > 0)
    const viewerButton = page.getByRole('button', { name: /Pemantau|VIEWER/ }).first()
    if (await viewerButton.count()) {
      await viewerButton.click()
      await page.waitForTimeout(600)
    }
    const firstBox = page.locator('[role="checkbox"], input[type="checkbox"]').first()
    await firstBox.click()
    const roleBarShown = await waitFor(async () =>
      (await page.getByText(/belum disimpan/i).count()) > 0, 8_000)
    check('UX', 'perubahan izin role memunculkan bilah simpan', roleBarShown, roleBarShown ? 'terdeteksi' : 'tidak terdeteksi')
    if (roleBarShown) {
      await page.getByRole('button', { name: /Batalkan/ }).click()
      await page.waitForTimeout(500)
      const barGone = (await page.getByText(/belum disimpan/i).count()) === 0
      check('UX', 'tombol Batalkan mengembalikan perubahan izin', barGone, barGone ? 'bilah hilang' : 'bilah masih ada')
    }

    // A6. Pengunjung mengambil nomor sepenuhnya lewat antarmuka publik
    const visitorCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
    const visitor = await visitorCtx.newPage()
    visitor.setDefaultTimeout(45_000)
    visitor.setDefaultNavigationTimeout(60_000)
    const visitorErrors = []
    visitor.on('pageerror', e => visitorErrors.push(e.message.split('\n')[0].slice(0, 120)))
    visitor.on('console', m => { if (m.type() === 'error') visitorErrors.push(m.text().split('\n')[0].slice(0, 120)) })

    await visitor.goto(`${BASE}/p/${publicPage.publishCode}`, { waitUntil: 'domcontentloaded' })
    await hydrated(visitor)
    await waitFor(async () => (await visitor.getByText(serviceName).count()) > 0)
    /**
     * Nama layanan kini judul di dalam kartu, bukan tombol — yang ditekan adalah
     * tombol "Ambil Nomor" pada kartu itu.
     */
    await visitor.locator('article').filter({ hasText: serviceName }).first()
      .getByRole('button').first().click()
    const gotTicket = await waitFor(async () => /\/queue\//.test(visitor.url()), 20_000)
    // Dipakai lagi pada bagian tema: halaman tiket harus ikut punya sakelar tema.
    const ticketUrl = gotTicket ? visitor.url() : ''
    check('FUNGSI', 'pengunjung ponsel mendapat nomor antrean lewat antarmuka', gotTicket,
      gotTicket ? visitor.url().replace(BASE, '') : 'tidak berpindah ke halaman tiket')

    const queueNumber = gotTicket
      ? (await visitor.locator('.queue-number').first().innerText().catch(() => '')).trim()
      : ''
    check('UI', 'nomor antrean ditampilkan besar di halaman tiket', !!queueNumber, queueNumber || 'tidak ditemukan')

    // A7. Operator memanggil lewat antarmuka, pengunjung melihat perubahannya
    const opCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    const operatorPage = await opCtx.newPage()
    operatorPage.setDefaultTimeout(45_000)
    operatorPage.setDefaultNavigationTimeout(60_000)
    await operatorPage.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
    await hydrated(operatorPage)
    await masukLewatUi(operatorPage, BASE, operatorEmail)
    const operatorReady = await operatorPage.waitForURL(/\/operator/, { timeout: 90_000 })
      .then(() => true)
      .catch(() => false)
    check('FUNGSI', 'operator berhasil masuk ke dashboard-nya', operatorReady,
      operatorReady ? operatorPage.url().replace(BASE, '') : `terhenti di ${operatorPage.url().replace(BASE, '')}`)
    await hydrated(operatorPage)
    await operatorPage.waitForTimeout(1200)

    /**
     * Operator uji ini hanya memegang satu layanan (§28: satu operator satu event),
     * jadi bilah pemilih layanan memang TIDAK dirender — papan kerjanya langsung
     * terbuka. Tab hanya diklik bila kebetulan ada lebih dari satu penugasan.
     */
    const auditTab = operatorPage.getByRole('button', { name: serviceName }).first()
    if (await auditTab.count()) {
      await auditTab.click()
      await operatorPage.waitForTimeout(2500)
    }

    const boardShowsService = await waitFor(async () =>
      (await operatorPage.locator('header, main').first().innerText()).includes(serviceName), 20_000)
    check('FUNGSI', 'papan operator terbuka pada layanan yang ditugaskan', boardShowsService,
      boardShowsService ? serviceName : `"${serviceName}" tidak terlihat di papan operator`)

    const nextButton = operatorPage.getByRole('button', { name: /Panggil Berikutnya|NEXT/i }).first()
    const hasNext = await waitFor(async () => (await nextButton.count()) > 0, 15_000)
    check('UI', 'dashboard operator menyediakan tombol panggil berikutnya', hasNext)

    const nextEnabled = hasNext
      ? await waitFor(async () => await nextButton.isEnabled(), 20_000)
      : false
    check('UX', 'tombol panggil berikutnya aktif saat memang ada yang menunggu', nextEnabled,
      nextEnabled ? 'aktif' : 'tetap nonaktif walau ada antrean menunggu')

    if (nextEnabled && queueNumber) {
      await nextButton.click()
      const calledOnOperator = await waitFor(async () =>
        (await operatorPage.getByText(queueNumber).count()) > 0, 20_000)
      check('FUNGSI', 'operator memanggil antrean lewat antarmuka', calledOnOperator,
        calledOnOperator ? `${queueNumber} tampil di panel operator` : 'nomor tidak muncul')

      const visitorNotified = await waitFor(async () => {
        const text = await visitor.locator('body').innerText()
        return /dipanggil/i.test(text)
      }, 20_000)
      check('FUNGSI', 'halaman pengunjung berubah tanpa reload saat dipanggil', visitorNotified,
        visitorNotified ? 'banner "dipanggil" muncul' : 'halaman pengunjung tidak berubah')
    }

    // A7b. Tombol nonaktif harus punya penjelasan di sekitarnya
    const waitingEmptyExplained = await operatorPage.evaluate(() => {
      const text = document.body.innerText
      return /menunggu/i.test(text)
    })
    check('UX', 'panel operator menjelaskan keadaan daftar tunggu', waitingEmptyExplained,
      waitingEmptyExplained ? 'jumlah/keadaan menunggu tertulis' : 'tidak ada keterangan daftar tunggu')

    // A8. Pencarian pengunjung lewat antarmuka
    await page.goto(`${BASE}/admin/visitors`, { waitUntil: 'domcontentloaded' })
    await hydrated(page)
    await page.waitForTimeout(1500)
    const rowsBefore = await page.locator('tbody tr').count()
    const searchBox = page.getByPlaceholder(/nama, HP, email/i)
    if (!(await searchBox.count())) {
      fail('UX', 'kolom pencarian pengunjung tidak ditemukan', 'placeholder berubah?')
    }
    await searchBox.fill('nomor-yang-tidak-mungkin-ada-123456')
    await page.waitForTimeout(1800)
    const emptyState = await page.getByText(/Tidak ada pengunjung/i).count()
    check('UX', 'pencarian tanpa hasil menampilkan keadaan kosong yang jelas', emptyState > 0,
      `${rowsBefore} baris → keadaan kosong ${emptyState ? 'tampil' : 'TIDAK tampil'}`)

    // ==================================================================
    // B. UI — responsif & tema
    // ==================================================================
    console.log('\n--- B. UI: responsif & tema gelap ---')

    const overflowing = []
    /** Halaman admin yang tidak punya sakelar tema — dikumpulkan sambil menyapu. */
    const tanpaSakelar = []
    for (const width of [390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 })
      for (const path of ADMIN_PAGES) {
        await page.goto(BASE + path, { waitUntil: 'domcontentloaded' })
        /**
         * Satu kali muat ulang bila hidrasi gagal.
         *
         * Server dev membangun ulang chunk setiap kali berkas disunting, dan tab
         * yang sudah lama terbuka bisa memegang referensi chunk lama ("Failed to
         * fetch dynamically imported module"). Aplikasi sendiri menanganinya lewat
         * `emitRouteChunkError: 'automatic-immediate'`; audit ini meniru langkah yang
         * sama agar tidak melaporkan gejala perkakas sebagai cacat antarmuka.
         * Kalau muat ulang pun gagal, barulah dilaporkan — dengan nama halamannya.
         */
        let ready = await hydrated(page).then(() => true).catch(() => false)
        if (!ready) {
          await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {})
          ready = await hydrated(page).then(() => true).catch(() => false)
        }
        if (!ready) {
          overflowing.push(`${path} @${width}px (gagal terhidrasi)`)
          continue
        }
        await page.waitForTimeout(500)
        const overflow = await page.evaluate(() => {
          const doc = document.documentElement
          return { scroll: doc.scrollWidth, client: doc.clientWidth }
        })
        // Ambang 2px memberi ruang untuk pembulatan sub-piksel
        if (overflow.scroll - overflow.client > 2) {
          overflowing.push(`${path} @${width}px (${overflow.scroll}>${overflow.client})`)
        }

        /**
         * Sakelar tema diperiksa di sini, menumpang sapuan yang sudah berjalan —
         * menambah 22 kali muat halaman lagi hanya untuk menghitung satu tombol
         * membuat audit ini lambat tanpa menambah apa pun.
         */
        if (width === 1440) {
          const toggles = await page.locator('[data-theme-toggle]').count()
          if (toggles !== 1) tanpaSakelar.push(`${path} (${toggles} sakelar)`)
        }
      }
    }
    check('UI', 'tidak ada halaman admin yang menggeser ke samping', overflowing.length === 0,
      overflowing.length ? overflowing.slice(0, 6).join(' | ') : `${ADMIN_PAGES.length} halaman × 3 lebar bersih`)

    await page.setViewportSize({ width: 1440, height: 900 })

    // Tema gelap: cari elemen yang latar & teksnya sama-sama terang
    await page.goto(`${BASE}/admin/dashboard`, { waitUntil: 'domcontentloaded' })
    await hydrated(page)
    await page.evaluate(() => {
      localStorage.setItem('nuxt-color-mode', 'dark')
      document.documentElement.classList.add('dark')
    })
    await page.reload({ waitUntil: 'domcontentloaded' })
    await hydrated(page)
    await page.waitForTimeout(1200)

    const darkOk = await page.evaluate(() => {
      const isDark = document.documentElement.classList.contains('dark')
      const body = getComputedStyle(document.body)
      return { isDark, bg: body.backgroundColor, color: body.color }
    })
    check('UI', 'tema gelap benar-benar aktif dan mengubah latar', darkOk.isDark,
      `dark=${darkOk.isDark} latar=${darkOk.bg}`)

    /**
     * Pemeriksa kontras dipakai untuk BEBERAPA halaman, bukan hanya dashboard.
     *
     * Tema gelap paling sering bocor di halaman yang jarang dibuka saat menyunting
     * gaya — halaman pengunjung misalnya, yang tidak memakai layout admin sama
     * sekali. Karena itu fungsinya dipisah dan dipanggil per halaman.
     */
    async function masalahKontrasGelap(target) {
      return target.evaluate(() => {
      /**
       * Konversi warna dikerjakan sendiri, bukan diserahkan ke canvas.
       *
       * Tailwind v4 memakai `oklch()`/`oklab()`, dan `canvas.fillStyle` menolak
       * format itu tanpa memberi tahu — nilai sebelumnya dipertahankan, sehingga
       * seluruh teks tampak berkontras 1.0:1 dan audit ini melaporkan masalah yang
       * tidak ada. Rumusnya baku, jadi lebih baik dihitung langsung.
       */
      function srgbToLinear(v) {
        const c = v / 255
        return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
      }

      /** Kembalikan [r, g, b] linear 0..1 beserta alpha. */
      function parseColor(input) {
        if (!input) return null
        const text = input.trim().toLowerCase()
        if (text === 'transparent') return { rgb: [0, 0, 0], alpha: 0 }

        const nums = (str) => (str.match(/-?[\d.]+%?/g) ?? []).map((n) => {
          return n.endsWith('%') ? Number.parseFloat(n) / 100 : Number.parseFloat(n)
        })

        if (text.startsWith('rgb')) {
          const [r, g, b, a] = nums(text)
          if ([r, g, b].some(v => v === undefined)) return null
          return { rgb: [srgbToLinear(r), srgbToLinear(g), srgbToLinear(b)], alpha: a ?? 1 }
        }

        if (text.startsWith('#')) {
          const hex = text.length === 4
            ? text.slice(1).split('').map(c => c + c).join('')
            : text.slice(1, 7)
          const [r, g, b] = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16))
          return { rgb: [srgbToLinear(r), srgbToLinear(g), srgbToLinear(b)], alpha: 1 }
        }

        // oklab(L a b [/ alpha]) dan oklch(L C H [/ alpha])
        if (text.startsWith('oklab') || text.startsWith('oklch')) {
          const parts = nums(text)
          if (parts.length < 3) return null
          const L = parts[0]
          let a, b
          if (text.startsWith('oklch')) {
            const hue = (parts[2] * Math.PI) / 180
            a = parts[1] * Math.cos(hue)
            b = parts[1] * Math.sin(hue)
          }
          else {
            a = parts[1]
            b = parts[2]
          }
          const alpha = parts[3] ?? 1

          const l_ = L + 0.3963377774 * a + 0.2158037573 * b
          const m_ = L - 0.1055613458 * a - 0.0638541728 * b
          const s_ = L - 0.0894841775 * a - 1.2914855480 * b
          const l = l_ ** 3, m = m_ ** 3, sv = s_ ** 3

          // Hasilnya sudah dalam ruang sRGB LINEAR — tepat yang dibutuhkan luminansi.
          const rgb = [
            4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * sv,
            -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * sv,
            -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * sv,
          ].map(v => Math.min(1, Math.max(0, v)))

          return { rgb, alpha }
        }

        return null
      }

      const luminance = rgb => 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]

      /** Susun latar efektif: warna semi-transparan ditumpuk di atas induknya. */
      function effectiveBackground(el) {
        const layers = []
        let node = el
        while (node) {
          const parsed = parseColor(getComputedStyle(node).backgroundColor)
          if (parsed && parsed.alpha > 0) {
            layers.push(parsed)
            if (parsed.alpha >= 1) break
          }
          node = node.parentElement
        }
        if (!layers.length) return [1, 1, 1]

        // Tumpuk dari lapisan terbawah ke atas
        let base = layers[layers.length - 1].alpha >= 1 ? layers.pop().rgb : [1, 1, 1]
        for (const layer of layers.reverse()) {
          base = base.map((v, i) => layer.rgb[i] * layer.alpha + v * (1 - layer.alpha))
        }
        return base
      }

      const problems = []
      for (const el of document.querySelectorAll('main *')) {
        if (!el.textContent?.trim() || el.children.length) continue
        const style = getComputedStyle(el)
        if (style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) < 0.3) continue
        if (!(el.offsetWidth || el.offsetHeight || el.getClientRects().length)) continue

        const fg = parseColor(style.color)
        if (!fg) continue
        const bgRgb = effectiveBackground(el)
        // Teks semi-transparan ikut dikomposit ke latarnya
        const fgRgb = fg.alpha >= 1
          ? fg.rgb
          : fg.rgb.map((v, i) => v * fg.alpha + bgRgb[i] * (1 - fg.alpha))

        const lFg = luminance(fgRgb)
        const lBg = luminance(bgRgb)
        const ratio = (Math.max(lFg, lBg) + 0.05) / (Math.min(lFg, lBg) + 0.05)

        // Teks besar cukup 3:1 (WCAG 1.4.3); teks biasa butuh 4.5:1.
        const size = Number.parseFloat(style.fontSize)
        const bold = Number(style.fontWeight) >= 700
        const minimum = size >= 24 || (bold && size >= 18.66) ? 3 : 4.5
        if (ratio < minimum) {
          problems.push(`${el.tagName.toLowerCase()}:"${el.textContent.trim().slice(0, 22)}" ${ratio.toFixed(1)}:1 (butuh ${minimum})`)
        }
      }
        return problems
      })
    }

    /**
     * Halaman yang disapu: satu dari tiap "keluarga" tampilan. Dashboard mewakili
     * layout admin, sisanya halaman yang gayanya ditulis sendiri.
     */
    const DARK_SWEEP = [
      '/admin/dashboard',
      '/admin/live-queue',
      '/admin/queue-types',
      '/admin/settings',
      '/admin/assignments',
      '/admin/feedback',
    ]

    const lowContrast = []
    for (const path of DARK_SWEEP) {
      await page.goto(BASE + path, { waitUntil: 'domcontentloaded' })
      await hydrated(page)
      await page.waitForTimeout(800)
      const problems = await masalahKontrasGelap(page)
      lowContrast.push(...problems.map(p => `${path} :: ${p}`))
    }

    check('UI', 'kontras teks di tema gelap memenuhi WCAG AA', lowContrast.length === 0,
      lowContrast.length
        ? lowContrast.slice(0, 6).join(' | ')
        : `${DARK_SWEEP.length} halaman: seluruh teks memenuhi 4.5:1 (3:1 untuk teks besar)`)

    check('UI', 'setiap halaman admin punya sakelar tema', tanpaSakelar.length === 0,
      tanpaSakelar.length ? tanpaSakelar.slice(0, 6).join(' | ') : `${ADMIN_PAGES.length} halaman punya sakelar`)

    /**
     * Halaman di luar panel admin diperiksa dengan konteks bersih.
     *
     * Halaman login dan beranda menolak pengguna yang sudah masuk (middleware
     * guest), jadi memeriksanya lewat sesi admin justru mengukur halaman lain.
     */
    const guestCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
    const guest = await guestCtx.newPage()
    guest.setDefaultTimeout(45_000)
    guest.setDefaultNavigationTimeout(60_000)

    const halamanLuar = [
      ['beranda', '/'],
      ['login', '/login'],
      ['halaman publik', `/p/${publicPage.publishCode}`],
      ...(ticketUrl ? [['tiket pengunjung', ticketUrl.replace(BASE, '')]] : []),
      ['galat 404', `/rute-tidak-ada-${Date.now()}`],
    ]

    const luarTanpaSakelar = []
    for (const [label, path] of halamanLuar) {
      await guest.goto(BASE + path, { waitUntil: 'domcontentloaded' })
      await hydrated(guest)
      await guest.waitForTimeout(600)
      const toggles = await guest.locator('[data-theme-toggle]').count()
      if (toggles !== 1) luarTanpaSakelar.push(`${label} (${toggles} sakelar)`)
    }

    // Panel operator memakai layout sendiri, jadi diperiksa lewat sesi operator.
    const operatorToggles = await operatorPage.locator('[data-theme-toggle]').count()
    if (operatorToggles !== 1) luarTanpaSakelar.push(`panel operator (${operatorToggles} sakelar)`)

    check('UI', 'halaman non-admin (beranda, login, publik, tiket, 404, operator) punya sakelar tema',
      luarTanpaSakelar.length === 0,
      luarTanpaSakelar.length ? luarTanpaSakelar.join(' | ') : `${halamanLuar.length + 1} halaman punya sakelar`)

    /**
     * Menekan sakelar harus benar-benar mengganti tema DAN pilihannya bertahan.
     *
     * Menyimpan pilihan itulah bagian yang paling mudah salah: tema bisa tampak
     * berganti sekejap lalu kembali ke semula saat halaman berikutnya dibuka.
     */
    await guest.goto(`${BASE}/p/${publicPage.publishCode}`, { waitUntil: 'domcontentloaded' })
    await hydrated(guest)
    await guest.waitForTimeout(600)
    const temaAwal = await guest.evaluate(() => document.documentElement.classList.contains('dark'))
    await guest.locator('[data-theme-toggle]').first().click()
    const berganti = await waitFor(async () =>
      (await guest.evaluate(() => document.documentElement.classList.contains('dark'))) !== temaAwal, 6_000)
    check('UI', 'menekan sakelar tema benar-benar mengganti tema', berganti,
      berganti ? `gelap: ${temaAwal} → ${!temaAwal}` : 'kelas dark pada <html> tidak berubah')

    await guest.reload({ waitUntil: 'domcontentloaded' })
    await hydrated(guest)
    await guest.waitForTimeout(600)
    const setelahReload = await guest.evaluate(() => document.documentElement.classList.contains('dark'))
    await guest.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
    await hydrated(guest)
    await guest.waitForTimeout(600)
    const setelahPindah = await guest.evaluate(() => document.documentElement.classList.contains('dark'))
    check('UI', 'pilihan tema bertahan setelah muat ulang & pindah halaman',
      setelahReload === !temaAwal && setelahPindah === !temaAwal,
      `reload=${setelahReload} pindah-halaman=${setelahPindah} (diharapkan ${!temaAwal})`)

    await guestCtx.close()

    await page.evaluate(() => {
      localStorage.setItem('nuxt-color-mode', 'light')
      document.documentElement.classList.remove('dark')
    })

    // ==================================================================
    // C. UX & aksesibilitas
    // ==================================================================
    console.log('\n--- C. UX & aksesibilitas ---')

    const a11y = { unlabeledInputs: [], namelessButtons: [], badHeadings: [], imagesNoAlt: [], titles: new Map() }

    for (const path of ADMIN_PAGES) {
      await page.goto(BASE + path, { waitUntil: 'domcontentloaded' })
      await hydrated(page)
      await page.waitForTimeout(500)

      const result = await page.evaluate(() => {
        const named = (el) => {
          if (el.getAttribute('aria-label')?.trim()) return true
          const labelledBy = el.getAttribute('aria-labelledby')
          if (labelledBy && labelledBy.split(/\s+/).some(id => document.getElementById(id)?.textContent?.trim())) return true
          if (el.id && document.querySelector(`label[for="${el.id}"]`)) return true
          if (el.closest('label')) return true
          if (el.getAttribute('title')?.trim()) return true
          if (el.getAttribute('placeholder')?.trim()) return true
          return false
        }

        // Input dengan display:none tidak dibacakan pembaca layar, jadi tidak perlu nama.
        const visible = el => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length)

        const inputs = [...document.querySelectorAll('main input:not([type=hidden]), main textarea, main select')]
          .filter(el => visible(el) && !named(el))
          .map(el => `${el.tagName.toLowerCase()}[type=${el.getAttribute('type') ?? '-'}]`)

        /**
        * Kotak centang dan sakelar sering dibungkus <label> berteks — namanya
        * datang dari sana, jadi tidak perlu aria-label lagi. Tanpa pengecualian
        * ini, satu matriks izin dilaporkan sebagai 42 tombol tanpa nama.
        */
        const buttons = [...document.querySelectorAll('main button, main [role=button]')]
          .filter(el => !named(el)
            && !el.textContent?.trim()
            && !el.closest('label')
            && !el.getAttribute('aria-labelledby'))
          .map(el => `${el.getAttribute('role') ?? 'button'}:${el.className.toString().slice(0, 30)}`)

        const h1s = document.querySelectorAll('main h1, h1').length
        const images = [...document.querySelectorAll('main img')]
          .filter(img => img.getAttribute('alt') === null)
          .map(img => img.getAttribute('src')?.slice(0, 40) ?? 'img')

        return { inputs, buttons, h1s, images, title: document.title }
      })

      if (result.inputs.length) a11y.unlabeledInputs.push(`${path}: ${result.inputs.slice(0, 4).join(', ')}`)
      if (result.buttons.length) a11y.namelessButtons.push(`${path}: ${result.buttons.length} tombol`)
      if (result.h1s !== 1) a11y.badHeadings.push(`${path}: ${result.h1s}×h1`)
      if (result.images.length) a11y.imagesNoAlt.push(`${path}: ${result.images.length} gambar`)
      a11y.titles.set(path, result.title)
    }

    check('A11Y', 'setiap kolom masukan punya nama yang bisa dibaca pembaca layar',
      a11y.unlabeledInputs.length === 0,
      a11y.unlabeledInputs.length ? a11y.unlabeledInputs.slice(0, 4).join(' | ') : `${ADMIN_PAGES.length} halaman bersih`)

    check('A11Y', 'tidak ada tombol ikon tanpa nama',
      a11y.namelessButtons.length === 0,
      a11y.namelessButtons.length ? a11y.namelessButtons.slice(0, 5).join(' | ') : 'seluruh tombol punya nama')

    check('A11Y', 'setiap halaman punya tepat satu h1',
      a11y.badHeadings.length === 0,
      a11y.badHeadings.length ? a11y.badHeadings.slice(0, 5).join(' | ') : 'struktur judul rapi')

    check('A11Y', 'setiap gambar punya atribut alt',
      a11y.imagesNoAlt.length === 0,
      a11y.imagesNoAlt.length ? a11y.imagesNoAlt.slice(0, 4).join(' | ') : 'seluruh gambar beratribut alt')

    const uniqueTitles = new Set(a11y.titles.values())
    check('UX', 'judul dokumen berbeda per halaman (penting untuk banyak tab)',
      uniqueTitles.size >= ADMIN_PAGES.length - 1,
      `${uniqueTitles.size} judul unik dari ${ADMIN_PAGES.length} halaman`)

    // Fokus keyboard harus terlihat
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
    await hydrated(page)
    await page.keyboard.press('Tab')
    await page.keyboard.press('Tab')
    const focusVisible = await page.evaluate(() => {
      const el = document.activeElement
      if (!el || el === document.body) return { ok: false, reason: 'tidak ada elemen yang menerima fokus' }
      const style = getComputedStyle(el)
      const hasRing = style.outlineStyle !== 'none' || style.boxShadow !== 'none'
      return { ok: hasRing, tag: el.tagName.toLowerCase(), outline: style.outlineStyle, shadow: style.boxShadow.slice(0, 30) }
    })
    check('A11Y', 'elemen yang difokus keyboard punya penanda visual', focusVisible.ok,
      focusVisible.ok ? `${focusVisible.tag}: outline=${focusVisible.outline}` : focusVisible.reason)

    // Target sentuh di ponsel
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(`${BASE}/admin/queue-types`, { waitUntil: 'domcontentloaded' })
    await hydrated(page)
    await page.waitForTimeout(800)
    const smallTargets = await page.evaluate(() => {
      // WCAG 2.2 SC 2.5.8 (AA) menetapkan minimum 24×24 CSS piksel.
      const MIN = 24
      const small = []
      for (const el of document.querySelectorAll('main button, main a[href]')) {
        const r = el.getBoundingClientRect()
        if (r.width === 0 || r.height === 0) continue
        if (r.height < MIN || r.width < MIN) {
          small.push(`${el.getAttribute('aria-label') || el.textContent?.trim().slice(0, 18) || el.className.toString().slice(0, 18)} ${Math.round(r.width)}×${Math.round(r.height)}`)
        }
      }
      return small
    })
    check('UX', 'target sentuh di ponsel memenuhi minimum WCAG 2.2 (24px)', smallTargets.length === 0,
      smallTargets.length ? smallTargets.slice(0, 5).join(' | ') : 'seluruh tombol ≥24×24')

    await page.setViewportSize({ width: 1440, height: 900 })

    // Halaman tidak ditemukan
    await page.goto(`${BASE}/halaman-yang-tidak-ada-${stamp}`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1200)
    const notFoundText = await page.locator('body').innerText()
    check('UX', 'rute tak dikenal menampilkan halaman 404 yang ramah',
      /tidak ditemukan|404|not found/i.test(notFoundText) && !/Internal Server Error/i.test(notFoundText),
      notFoundText.replace(/\s+/g, ' ').slice(0, 70))

    /**
     * Keadaan memuat diuji pada navigasi DI DALAM aplikasi, bukan muat penuh.
     * Saat muat penuh, yang menutupi jeda adalah indikator peramban sendiri;
     * yang benar-benar milik aplikasi hanya terlihat saat berpindah halaman.
     */
    await page.goto(`${BASE}/admin/dashboard`, { waitUntil: 'domcontentloaded' })
    await hydrated(page)
    await page.waitForTimeout(800)
    await page.route('**/api/admin/queues**', async (route) => {
      await new Promise(r => setTimeout(r, 2500))
      await route.continue()
    })
    await page.getByRole('link', { name: /Antrean Live/ }).first().click({ timeout: 15_000 }).catch(async () => {
      // Menu bisa tergulung; pakai navigasi klien sebagai gantinya.
      await page.evaluate(() => window.history.pushState({}, '', '/admin/live-queue'))
      await page.goto(`${BASE}/admin/live-queue`, { waitUntil: 'commit' })
    })
    const loadingSeen = await waitFor(async () =>
      (await page.locator('.animate-pulse, [class*="skeleton"], [role="progressbar"], .nuxt-loading-indicator').count()) > 0,
    8_000, 100)
    check('UX', 'ada indikator memuat saat data belum siap', loadingSeen,
      loadingSeen ? 'skeleton / bilah progres terlihat' : 'tidak ada indikator; halaman tampak kosong dulu')
    await page.unroute('**/api/admin/queues**')

    // Galat jaringan harus dijelaskan, bukan halaman putih
    await page.route('**/api/admin/testimonials**', route => route.abort('failed'))
    await page.goto(`${BASE}/admin/feedback`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(3000)
    const bodyOnError = await page.locator('body').innerText()
    check('UX', 'kegagalan jaringan tidak menghasilkan halaman kosong',
      bodyOnError.trim().length > 60,
      `${bodyOnError.trim().length} karakter tampil`)
    await page.unroute('**/api/admin/testimonials**')

    // ==================================================================
    // D. Galat console sepanjang audit
    // ==================================================================
    console.log('\n--- D. Kebersihan console ---')
    /**
     * Dua kelompok dikecualikan, dan alasannya harus jelas:
     *  - galat dari permintaan yang SENGAJA digagalkan audit ini;
     *  - galat CSP pada halaman galat bawaan server dev (overlay Vite/DevTools),
     *    yang tidak ikut terbawa ke build produksi.
     */
    const devOverlayNoise = e =>
      (/Content Security Policy/.test(e) && /rute-tidak-ada|halaman-yang-tidak-ada/.test(e))
      // Kanal hot-reload Vite: /_nuxt/?token=… pada porta dev. Tidak ada di produksi.
      || e.includes(String.raw`_nuxt/?token=`)
      || e.includes(String.raw`[vite] failed to connect`)
    const intentional = e =>
      /testimonials/.test(e)
      || /Failed to load resource/.test(e)
      // Permintaan yang sengaja digagalkan pada halaman feedback
      || (/\/admin\/feedback/.test(e) && /Tidak dapat terhubung|net::ERR/.test(e))
    const realErrors = [...new Set(consoleErrors)].filter(e => !intentional(e) && !devOverlayNoise(e))
    const cspNoise = [...new Set(consoleErrors)].filter(devOverlayNoise)
    if (cspNoise.length) {
      console.log(`  catatan: ${cspNoise.length} galat berasal dari perkakas server dev (halaman galat & hot-reload Vite) — tidak ada di produksi`)
    }
    check('UI', 'tidak ada galat JavaScript di seluruh perjalanan admin',
      realErrors.length === 0,
      realErrors.length ? realErrors.slice(0, 4).join(' | ') : `${consoleErrors.length} pesan, semuanya dari galat yang disengaja audit`)

    const realVisitorErrors = [...new Set(visitorErrors)]
    check('UI', 'tidak ada galat JavaScript di sisi pengunjung',
      realVisitorErrors.length === 0,
      realVisitorErrors.length ? realVisitorErrors.slice(0, 3).join(' | ') : 'bersih')

    await visitorCtx.close()
    await opCtx.close()
    await ctx.close()
  }
  finally {
    await browser.close()
    await api('POST', '/api/auth/sign-in/email', { email: 'superadmin@antrean.local', password: 'password123' }).catch(() => {})
    await api('POST', '/api/admin/settings/reset').catch(() => {})

    /**
     * Event tidak bisa dihapus selama masih ada antrean aktif — itu penjaga yang
     * memang benar. Jadi antrean bikinan audit ini dibatalkan lebih dulu; kalau
     * tidak, tiap jalan audit meninggalkan satu event yang lalu muncul sebagai tab
     * baru di panel operator dan mengaburkan hasil jalan berikutnya.
     */
    const leftovers = await api('GET', `/api/admin/queues?eventId=${eventId}&perPage=200`).catch(() => null)
    for (const q of leftovers?.data?.items ?? []) {
      if (!['WAITING', 'CALLED', 'SERVING'].includes(q.status)) continue
      await api('POST', `/api/operator/queue/${q.id}/cancel`, { reason: 'Pembersihan audit UX' }).catch(() => {})
    }

    const removed = await api('DELETE', `/api/admin/events/${eventId}`).catch(() => null)
    if (!removed?.success) {
      console.log(`  catatan: event uji tidak terhapus — ${removed?.message ?? 'permintaan gagal'}`)
    }

    /**
     * Operator uji ikut dihapus. Menghapus event saja tidak cukup — akunnya tetap
     * berdiri dan menumpuk di halaman Pengguna sebagai "Operator Uji" palsu.
     */
    await api('DELETE', `/api/admin/users/${operator.id}`).catch(() => {})
  }

  console.log(`\n${passes.length} lolos · ${findings.length} temuan`)
  if (findings.length) {
    console.log('\nDaftar temuan:')
    for (const f of findings) console.log(`  [${f.area}] ${f.name}\n      ${f.detail}`)
  }
  process.exit(0)
}

main().catch((e) => { console.error('CRASH', e); process.exit(2) })
