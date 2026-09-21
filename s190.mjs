import { chromium } from 'playwright'
import { masukLewatUi } from './scripts/captcha.mjs'
const BASE = 'http://localhost:3000'
const OUT = 'C:/Users/teguh/AppData/Local/Temp/claude/c--Users-teguh-Documents-dev-WEB-antrean-ahu/389e162f-6ac9-4156-8a34-e2e2c29bcefd/scratchpad'
const QT = '01M25DPC3C2DWED1Q07AJD5VEM'
const EV = '01M25DM9RHXZJ1QNPTD96J1TYB'
const IMG = '01M2783TF6CQQ2FTWM5B1GNZ74'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1360, height: 980 } })
const page = await ctx.newPage()
page.on('pageerror', e => console.log('PAGEERROR:', e.message.slice(0, 140)))
await page.goto(BASE + '/login', { waitUntil: 'networkidle' })
await page.waitForTimeout(1500)
await masukLewatUi(page, BASE, 'superadmin@antrean.local')
await page.waitForTimeout(2500)
const api = (m, u, b) => page.evaluate(async ([m, u, b]) => {
  const r = await fetch(u, { method: m, ...(b ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) } : {}) })
  const j = await r.json().catch(() => null); return { status: r.status, message: j?.message, data: j?.data }
}, [m, u, b])
const berkas = async () => ((await api('GET', '/api/admin/media?usages=true')).data ?? []).find(m => m.id === IMG)

console.log('0. keadaan awal')
let m = await berkas()
console.log('   nama:', m.name, '| usages:', JSON.stringify(m.usages))
console.log('   tanpa flag, field usages ada?', 'usages' in ((await api('GET', '/api/admin/media')).data[0]))

console.log('\n1. belum dipakai -> boleh dihapus? (uji tolak/izin tanpa benar-benar menghapus)')
console.log('   (dilewati: berkas ini dipakai di langkah berikut)')

console.log('\n2. pasang sebagai logo jenis antrean')
console.log('   patch qt ->', (await api('PATCH', `/api/admin/queue-types/${QT}`, { logoMediaId: IMG })).status)
m = await berkas(); console.log('   usages:', JSON.stringify(m.usages))
let hapus = await api('DELETE', `/api/admin/media/${IMG}`)
console.log('   DELETE ->', hapus.status, hapus.message)

console.log('\n3. tambah pemakaian lewat URL (logo halaman publik)')
const hal = (await api('GET', '/api/admin/public-pages')).data
const halaman = (Array.isArray(hal) ? hal : hal.items).find(h => h.event?.id === EV) ?? (Array.isArray(hal) ? hal : hal.items)[0]
const halSemula = (await api('GET', `/api/admin/public-pages/${halaman.id}`)).data
console.log('   halaman:', halSemula.title, '| logoUrl semula:', halSemula.logoUrl)
console.log('   patch ->', (await api('PATCH', `/api/admin/public-pages/${halaman.id}`, { title: halSemula.title, logoUrl: m.url })).status)
m = await berkas(); console.log('   usages:', JSON.stringify(m.usages))

console.log('\n4. tambah pemakaian lewat branding event')
const ev = (await api('GET', `/api/admin/events/${EV}`)).data
const brandingSemula = ev.branding ?? {}
console.log('   patch event ->', (await api('PATCH', `/api/admin/events/${EV}`, { branding: { ...brandingSemula, logoUrl: m.url } })).status)
m = await berkas(); console.log('   usages:', JSON.stringify(m.usages))
hapus = await api('DELETE', `/api/admin/media/${IMG}`)
console.log('   DELETE ->', hapus.status, hapus.message)

console.log('\n5. tampilan pustaka media')
await page.goto(`${BASE}/admin/media`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(4000)
const kartu = page.locator('div.group').filter({ hasText: 'direktorat-jenderal' }).first()
await kartu.scrollIntoViewIfNeeded()
console.log('   teks penanda:', (await kartu.innerText()).replace(/\s+/g, ' ').slice(0, 160))
await kartu.getByRole('button', { name: 'Menu tindakan' }).click()
await page.waitForTimeout(700)
const menu = page.locator('[role="menuitem"]')
console.log('   menu:', (await menu.allInnerTexts()).join(' | '))
console.log('   status Hapus:', await menu.filter({ hasText: /Sedang dipakai|Hapus/ }).last().getAttribute('data-disabled'), '| aria-disabled:', await menu.filter({ hasText: /Sedang dipakai|Hapus/ }).last().getAttribute('aria-disabled'))
await page.screenshot({ path: `${OUT}/M-pustaka.png` })
await page.keyboard.press('Escape')

console.log('\n6. lepas semua, pastikan bisa dihapus lagi (dicek lewat usages, tanpa menghapus)')
await api('PATCH', `/api/admin/queue-types/${QT}`, { logoMediaId: null })
await api('PATCH', `/api/admin/public-pages/${halaman.id}`, { title: halSemula.title, logoUrl: halSemula.logoUrl })
await api('PATCH', `/api/admin/events/${EV}`, { branding: brandingSemula })
m = await berkas()
console.log('   usages:', JSON.stringify(m.usages), '| kosong =', m.usages.length === 0)
await browser.close()
