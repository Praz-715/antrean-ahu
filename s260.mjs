import { chromium } from 'playwright'
const BASE = 'http://localhost:3000'
const OUT = 'C:/Users/teguh/AppData/Local/Temp/claude/c--Users-teguh-Documents-dev-WEB-antrean-ahu/389e162f-6ac9-4156-8a34-e2e2c29bcefd/scratchpad'
const KOSONG = 'oY1YdnLJi9TJCvhSXVkvY7ir79Im2LGyL55YYAQrmks'
const browser = await chromium.launch()
const p = await (await browser.newContext({ viewport: { width: 560, height: 1000 }, deviceScaleFactor: 2 })).newPage()
await p.goto(`${BASE}/queue/${KOSONG}`, { waitUntil: 'domcontentloaded' })
await p.waitForTimeout(4000)
await p.getByRole('button', { name: /bintang/ }).nth(2).click()
await p.waitForTimeout(600)

const detail = await p.evaluate(() => [...document.querySelectorAll('svg')]
  .filter(s => s.querySelector('path')?.getAttribute('d')?.startsWith('M11.525'))
  .map((s) => {
    const cs = getComputedStyle(s)
    const path = s.querySelector('path')
    const cp = getComputedStyle(path)
    return {
      attrFill: s.getAttribute('fill'),
      svgFill: cs.fill,
      pathFill: cp.fill,
      warna: cs.color,
      stroke: cp.stroke,
    }
  }))
console.log('bintang 1-5:')
for (const [i, d] of detail.entries()) console.log(`  ${i + 1}. attr=${d.attrFill} | computed svg.fill=${d.svgFill} | path.fill=${d.pathFill} | color=${d.warna}`)

const blok = p.locator('div').filter({ hasText: 'Penilaian Anda membantu' }).last()
await blok.scrollIntoViewIfNeeded()
await blok.screenshot({ path: `${OUT}/S-input-lg.png` })
await browser.close()
