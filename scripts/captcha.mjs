/**
 * Menyelesaikan captcha geser untuk uji otomatis.
 *
 * Halaman masuk mewajibkan tiket captcha, jadi setiap skrip yang login lewat API
 * harus melewatinya juga. Jalur yang ditempuh di sini sama persis dengan jalur
 * pengguna sungguhan — minta teka-teki, kirim posisi, terima tiket sekali pakai —
 * hanya posisi jawabannya yang dibaca dari endpoint khusus pengembangan.
 *
 * Endpoint itu menjawab 404 bila `CAPTCHA_DEV_BYPASS=1` tidak dipasang pada server
 * dev, dan tidak pernah ada di produksi.
 */

async function json(base, method, path, body) {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', Origin: base },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  return res.json()
}

/** Satu tiket captcha sekali pakai. */
export async function tiketCaptcha(base, purpose = 'login') {
  const teka = await json(base, 'GET', `/api/captcha/slider?purpose=${purpose}`)
  if (!teka?.success) {
    throw new Error(`gagal meminta teka-teki captcha: ${teka?.message ?? 'tidak ada respons'}`)
  }

  const jawaban = await json(base, 'GET', `/api/captcha/answer?id=${encodeURIComponent(teka.data.id)}`)
  if (!jawaban?.success) {
    throw new Error(
      'jawaban teka-teki tidak terbuka — pasang CAPTCHA_DEV_BYPASS=1 di .env lalu jalankan ulang server dev',
    )
  }

  /**
   * Durasi dan jumlah gerakan dilaporkan apa adanya seperti yang dikirim peramban.
   * Tidak perlu benar-benar menunggu: yang diperiksa server adalah angkanya wajar,
   * dan menunda tiap login akan memperlambat seluruh rangkaian uji tanpa guna.
   */
  const hasil = await json(base, 'POST', '/api/captcha/slider', {
    id: teka.data.id,
    x: jawaban.data.x,
    durationMs: 640,
    moves: 14,
    purpose,
  })
  if (!hasil?.success) throw new Error(`verifikasi geser gagal: ${hasil?.message ?? 'tidak ada respons'}`)

  return hasil.data.token
}

/** Header tambahan untuk satu permintaan; kosong untuk jalur selain masuk. */
export async function headerCaptcha(base, path) {
  if (!String(path).startsWith('/api/auth/sign-in/email')) return {}
  return { 'x-captcha-token': await tiketCaptcha(base, 'login') }
}

/* ------------------------------------------------------------------ *
 * Lewat peramban
 * ------------------------------------------------------------------ */

/**
 * Mencatat id teka-teki yang dimuat halaman.
 *
 * Idnya tidak pernah muncul di DOM, jadi satu-satunya cara membacanya dari luar
 * adalah menyadap responsnya — persis seperti yang harus dilakukan skrip jahat,
 * bedanya jawabannya tetap tidak ada di sana.
 */
export function pantauTekaTeki(page) {
  const state = { id: null }
  page.on('response', async (res) => {
    if (!res.url().includes('/api/captcha/slider')) return
    try {
      const body = await res.json()
      if (body?.data?.id) state.id = body.data.id
    }
    catch { /* respons bukan JSON — abaikan */ }
  })
  return state
}

/** Menggeser potongan sampai pas, dengan gerakan bertahap seperti tangan manusia. */
export async function geserSampaiPas(page, base, state) {
  for (let i = 0; i < 60 && !state.id; i++) await page.waitForTimeout(100)
  if (!state.id) throw new Error('teka-teki captcha tidak pernah dimuat')

  const jawaban = await (await fetch(`${base}/api/captcha/answer?id=${encodeURIComponent(state.id)}`, {
    headers: { Origin: base },
  })).json()
  if (!jawaban?.success) {
    throw new Error('jawaban teka-teki tidak terbuka — pasang CAPTCHA_DEV_BYPASS=1 di .env')
  }

  const handle = page.locator('[role="slider"]')
  await handle.waitFor({ state: 'visible', timeout: 15_000 })

  /**
   * Jendela masih beranimasi saat pertama terlihat, jadi koordinatnya ditunggu
   * sampai diam. Tanpa ini, titik pegangan terbaca di tengah animasi dan seluruh
   * geseran meleset — kegagalan yang muncul sesekali saja dan menyesatkan.
   */
  let box = await handle.boundingBox()
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(50)
    const lagi = await handle.boundingBox()
    if (lagi && box && Math.abs(lagi.x - box.x) < 0.5 && Math.abs(lagi.y - box.y) < 0.5) { box = lagi; break }
    box = lagi
  }

  const target = jawaban.data.x
  const y = box.y + box.height / 2
  const mulai = box.x + box.width / 2

  await page.mouse.move(mulai, y)
  await page.mouse.down()
  for (let langkah = 1; langkah <= 10; langkah++) {
    await page.mouse.move(mulai + (target * langkah) / 10, y)
    await page.waitForTimeout(25)
  }

  /**
   * Selisih ditutup sebelum dilepas: halaman melaporkan posisi potongan lewat
   * aria-valuenow, jadi hasilnya bisa dibaca balik alih-alih diharapkan.
   */
  let pointer = mulai + target
  for (let i = 0; i < 4; i++) {
    const posisi = Number(await handle.getAttribute('aria-valuenow'))
    const selisih = target - posisi
    if (!Number.isFinite(selisih) || Math.abs(selisih) <= 1) break
    pointer += selisih
    await page.mouse.move(pointer, y)
    await page.waitForTimeout(30)
  }

  await page.mouse.up()

  state.id = null
}

/**
 * Masuk lewat halaman /login seperti pengguna: isi formulir, tekan tombol,
 * lalu selesaikan captcha geser yang muncul.
 */
export async function masukLewatUi(page, base, email, password = 'password123') {
  const state = pantauTekaTeki(page)
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(password)
  await page.locator('button[type="submit"]').click()
  await geserSampaiPas(page, base, state)
}
