/**
 * Pindahkan warna merek yang sudah TERSIMPAN di basis data ke palet navy AHU.
 *
 * Tema baru hanya mengubah nilai *bawaan* di kode; record yang sudah ada tetap
 * memegang biru terang lama (#1b5cf5) — dan justru record itulah yang digambar
 * di layar antrean dan halaman publik. Skrip ini menyusulnya.
 *
 * Jalankan `npx tsx scripts/retheme-navy.ts` untuk melihat rencananya saja,
 * dan tambahkan `--tulis` untuk benar-benar menyimpan.
 *
 * Aman diulang: yang ditulis adalah nilai tetap, bukan hasil penggeseran warna.
 */
import 'dotenv/config'
import { prisma } from '../server/utils/prisma'

const TULIS = process.argv.includes('--tulis')

/** brand-900 / brand-950 — sama dengan token di `app/assets/css/main.css`. */
const NAVY = '#132b48'
const NAVY_PEKAT = '#0a1b30'

/**
 * Semua jenis antrean memakai SATU navy, bukan satu nada per layanan.
 *
 * Sempat dicoba memberi tiap layanan satu tingkat dari tangga navy supaya kartunya
 * bisa dibedakan. Dua hal membuatnya tidak dipakai:
 *
 * 1. Papan antrean menerangkan warna ini lebih dulu (`readableColor`) agar terbaca
 *    di atas latar gelap. Karena seluruh tangga navy berhue sama, hasil terangnya
 *    berkumpul di sekitar warna yang nyaris identik — perbedaannya hilang justru
 *    di layar yang paling butuh.
 * 2. Nada terang di ujung tangga (brand-400) hanya mencapai 3,1:1 terhadap putih,
 *    sementara warna ini juga dipakai sebagai LATAR spanduk tiket yang tulisannya
 *    putih.
 *
 * Sebelum ditema ulang keenam layanan pun sudah berwarna sama (#1b5cf5), jadi tidak
 * ada pembeda yang hilang. Yang membedakan kartu di papan adalah nama direktorat
 * dan kode layanannya.
 */
const WARNA_LAYANAN = ['#132b48'] // brand-900

const rencana: string[] = []

function catat(apa: string, dari: unknown, ke: unknown) {
  rencana.push(`  ${apa}\n      ${JSON.stringify(dari)}\n   -> ${JSON.stringify(ke)}`)
}

async function main() {
  /* ---------------- branding event ---------------- */
  const events = await prisma.event.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true, branding: true },
  })

  for (const e of events) {
    const lama = (e.branding ?? {}) as Record<string, unknown>
    const baru = { ...lama, primaryColor: NAVY, secondaryColor: NAVY_PEKAT }
    if (lama.primaryColor === NAVY && lama.secondaryColor === NAVY_PEKAT) continue
    catat(`event "${e.name}"`, { primaryColor: lama.primaryColor, secondaryColor: lama.secondaryColor }, { primaryColor: NAVY, secondaryColor: NAVY_PEKAT })
    if (TULIS) await prisma.event.update({ where: { id: e.id }, data: { branding: baru as never } })
  }

  /* ---------------- warna jenis antrean ---------------- */
  const types = await prisma.queueType.findMany({
    where: { deletedAt: null },
    orderBy: [{ eventId: 'asc' }, { displayOrder: 'asc' }],
    select: { id: true, code: true, name: true, color: true, eventId: true },
  })

  const nomorDalamEvent = new Map<string, number>()
  for (const t of types) {
    const n = nomorDalamEvent.get(t.eventId) ?? 0
    nomorDalamEvent.set(t.eventId, n + 1)
    const warna = WARNA_LAYANAN[n % WARNA_LAYANAN.length]!
    if (t.color === warna) continue
    catat(`layanan ${t.code} — ${t.name}`, t.color, warna)
    if (TULIS) await prisma.queueType.update({ where: { id: t.id }, data: { color: warna } })
  }

  /* ---------------- tema halaman publik ---------------- */
  const pages = await prisma.publicPage.findMany({
    where: { deletedAt: null },
    select: { id: true, title: true, theme: true },
  })

  for (const p of pages) {
    const lama = (p.theme ?? {}) as Record<string, unknown>
    const baru = { ...lama, primaryColor: NAVY, secondaryColor: NAVY_PEKAT }
    // `accentColor` hanya ditimpa bila halamannya memang sudah punya nilai.
    if ('accentColor' in lama) baru.accentColor = '#2d5892'
    if (lama.primaryColor === NAVY && lama.secondaryColor === NAVY_PEKAT) continue
    catat(`halaman publik "${p.title}"`, { primaryColor: lama.primaryColor, secondaryColor: lama.secondaryColor, accentColor: lama.accentColor }, { primaryColor: NAVY, secondaryColor: NAVY_PEKAT, accentColor: baru.accentColor })
    if (TULIS) await prisma.publicPage.update({ where: { id: p.id }, data: { theme: baru as never } })
  }

  if (!rencana.length) {
    console.log('Tidak ada yang perlu diubah — semua record sudah memakai palet navy.')
    return
  }

  console.log(`${TULIS ? 'DITULIS' : 'RENCANA (belum ditulis)'} — ${rencana.length} perubahan:\n`)
  console.log(rencana.join('\n'))
  if (!TULIS) console.log('\nJalankan ulang dengan --tulis untuk menyimpan.')
}

await main()
await prisma.$disconnect()
