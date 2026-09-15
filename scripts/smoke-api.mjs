/**
 * Sapu seluruh endpoint tulis untuk menemukan jalur yang belum pernah dieksekusi.
 * Jalankan: node audit-endpoints.mjs
 */
import { headerCaptcha } from './captcha.mjs'

/** Alamat server yang diuji; timpa dengan SMOKE_BASE untuk menguji hasil build. */
const BASE = process.env.SMOKE_BASE || 'http://localhost:3000'
let cookie = ''
const results = []

async function call(method, path, body, opts = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { ...(await headerCaptcha(BASE, path)), 'Content-Type': 'application/json', Origin: BASE, ...(cookie ? { cookie } : {}), ...(opts.headers ?? {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
  const setCookie = res.headers.getSetCookie?.() ?? []
  if (setCookie.length) cookie = setCookie.map(c => c.split(';')[0]).join('; ')
  const text = await res.text()
  let json
  try { json = JSON.parse(text) } catch { json = { raw: text.slice(0, 120) } }
  return { status: res.status, json }
}

function record(name, ok, detail) {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'OK  ' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
}

async function check(name, fn) {
  try {
    const detail = await fn()
    record(name, true, detail)
  } catch (e) {
    record(name, false, e.message)
  }
}

function expectOk(res) {
  if (!res.json?.success) {
    throw new Error(`HTTP ${res.status} ${res.json?.code ?? ''} ${res.json?.message ?? JSON.stringify(res.json).slice(0, 120)}`)
  }
  return res.json.data
}

const state = {}

async function main() {
  // --- auth ---
  await check('POST /api/auth/sign-in/email (superadmin)', async () => {
    const res = await call('POST', '/api/auth/sign-in/email', {
      email: 'superadmin@antrean.local', password: 'password123',
    })
    if (res.status !== 200) throw new Error('HTTP ' + res.status)
    return 'sesi didapat'
  })

  await check('GET /api/me', async () => {
    const d = expectOk(await call('GET', '/api/me'))
    state.orgId = d.organization.id
    return `${d.roles.join(',')} superadmin=${d.isSuperadmin}`
  })

  // --- event ---
  await check('POST /api/admin/events', async () => {
    const d = expectOk(await call('POST', '/api/admin/events', {
      name: 'Audit Event ' + Date.now(), timezone: 'Asia/Jakarta', allowFinishAfterClose: true,
    }))
    state.eventId = d.id
    return d.slug
  })

  await check('PATCH /api/admin/events/{id}', async () => {
    const d = expectOk(await call('PATCH', `/api/admin/events/${state.eventId}`, { description: 'diubah audit' }))
    return d.description
  })

  await check('PUT /api/admin/events/{id}/schedules', async () => {
    const d = expectOk(await call('PUT', `/api/admin/events/${state.eventId}/schedules`, {
      schedules: Array.from({ length: 7 }, (_, day) => ({
        dayOfWeek: day, openTime: '00:00', closeTime: '23:59', isClosed: false,
      })),
    }))
    return d.length + ' jadwal'
  })

  await check('POST /api/admin/events/{id}/status OPEN', async () => {
    const d = expectOk(await call('POST', `/api/admin/events/${state.eventId}/status`, { status: 'OPEN' }))
    return d.status
  })

  await check('POST status transisi ilegal ditolak (OPEN→DRAFT)', async () => {
    const res = await call('POST', `/api/admin/events/${state.eventId}/status`, { status: 'DRAFT' })
    if (res.json?.success) throw new Error('seharusnya ditolak')
    return res.json.code
  })

  // --- queue type ---
  await check('POST /api/admin/queue-types', async () => {
    const d = expectOk(await call('POST', '/api/admin/queue-types', {
      eventId: state.eventId, code: 'X', name: 'Audit Layanan', prefix: 'X',
      startingNumber: 1, numberFormat: '{prefix}{seq}', padding: 3, color: '#1b5cf5',
      isActive: true, displayOrder: 1, estServiceSeconds: 300,
    }))
    state.queueTypeId = d.id
    return d.code
  })

  await check('POST queue-type kode duplikat ditolak', async () => {
    const res = await call('POST', '/api/admin/queue-types', {
      eventId: state.eventId, code: 'X', name: 'Duplikat', prefix: 'X',
      startingNumber: 1, numberFormat: '{prefix}{seq}', padding: 3, color: '#1b5cf5',
      isActive: true, displayOrder: 2, estServiceSeconds: 300,
    })
    if (res.json?.success) throw new Error('seharusnya ditolak')
    return res.json.code
  })

  await check('PATCH /api/admin/queue-types/{id}', async () => {
    const d = expectOk(await call('PATCH', `/api/admin/queue-types/${state.queueTypeId}`, { name: 'Audit Layanan Baru' }))
    return d.name
  })

  await check('POST /api/admin/queue-types/reorder', async () => {
    const d = expectOk(await call('POST', '/api/admin/queue-types/reorder', {
      eventId: state.eventId, ids: [state.queueTypeId],
    }))
    return d.length + ' item'
  })

  // --- counter ---
  await check('POST /api/admin/counters', async () => {
    const d = expectOk(await call('POST', '/api/admin/counters', {
      eventId: state.eventId, code: 'AX1', name: 'Loket Audit', isActive: true, displayOrder: 1,
    }))
    state.counterId = d.id
    return d.name
  })

  await check('PATCH /api/admin/counters/{id}', async () => {
    const d = expectOk(await call('PATCH', `/api/admin/counters/${state.counterId}`, { name: 'Loket Audit 2' }))
    return d.name
  })

  // --- user ---
  await check('GET /api/admin/users', async () => {
    const d = expectOk(await call('GET', '/api/admin/users'))
    state.roles = d.roles
    state.operatorRoleId = d.roles.find(r => r.key === 'OPERATOR')?.id
    return `${d.users.length} user, ${d.roles.length} role`
  })

  const auditEmail = `audit${Date.now()}@antrean.local`
  await check('POST /api/admin/users', async () => {
    const d = expectOk(await call('POST', '/api/admin/users', {
      name: 'Operator Audit', email: auditEmail, password: 'password123',
      username: 'opaudit' + Date.now(), roleId: state.operatorRoleId,
    }))
    state.userId = d.id
    return d.email
  })

  await check('PATCH /api/admin/users/{id}', async () => {
    const d = expectOk(await call('PATCH', `/api/admin/users/${state.userId}`, { name: 'Operator Audit Ubah' }))
    return d.name
  })

  await check('POST /api/admin/users/{id}/password (reset)', async () => {
    expectOk(await call('POST', `/api/admin/users/${state.userId}/password`, { password: 'rahasia12345' }))
    return 'direset'
  })

  await check('login dengan password hasil reset', async () => {
    const saved = cookie
    cookie = ''
    const res = await call('POST', '/api/auth/sign-in/email', { email: auditEmail, password: 'rahasia12345' })
    cookie = saved
    if (res.status !== 200) throw new Error('HTTP ' + res.status + ' ' + JSON.stringify(res.json).slice(0, 100))
    return 'berhasil masuk'
  })

  // --- layanan loket & penempatan operator ---
  // Layanan melekat pada LOKET; operator mewarisinya dengan duduk di sana (§12, §28).
  await check('PUT /api/admin/counters/{id}/services', async () => {
    const d = expectOk(await call('PUT', `/api/admin/counters/${state.counterId}/services`, {
      queueTypeIds: [state.queueTypeId],
    }))
    return d.services.map(s => s.queueType.code).join(', ')
  })

  await check('POST /api/admin/assignments (tempatkan operator)', async () => {
    const d = expectOk(await call('POST', '/api/admin/assignments', {
      userId: state.userId, counterId: state.counterId,
    }))
    state.assignmentId = d.id
    return `${d.counter.name} → ${d.services.map(s => s.code).join(', ')}`
  })

  await check('loket tanpa layanan tidak bisa ditempati', async () => {
    const kosong = expectOk(await call('POST', '/api/admin/counters', {
      eventId: state.eventId, code: 'LK', name: 'Loket Kosong',
    }))
    const res = await call('POST', '/api/admin/assignments', {
      userId: state.userId, counterId: kosong.id,
    })
    expectOk(await call('DELETE', `/api/admin/counters/${kosong.id}`))
    if (res.json?.success) throw new Error('seharusnya ditolak')
    return res.json.code
  })

  // --- form ---
  await check('POST /api/admin/forms', async () => {
    const d = expectOk(await call('POST', '/api/admin/forms', {
      eventId: state.eventId, name: 'Form Audit', description: 'uji',
    }))
    state.formId = d.id
    return d.name
  })

  await check('PUT /api/admin/forms/{id}/fields', async () => {
    const d = expectOk(await call('PUT', `/api/admin/forms/${state.formId}/fields`, {
      fields: [
        { key: 'full_name', label: 'Nama Lengkap', type: 'TEXT', isRequired: true },
        { key: 'layanan', label: 'Jenis Layanan', type: 'SELECT', isRequired: true,
          options: [{ label: 'Umum', value: 'umum' }, { label: 'Khusus', value: 'khusus' }] },
      ],
    }))
    return d.fields.length + ' field'
  })

  await check('PUT fields dengan key duplikat ditolak', async () => {
    const res = await call('PUT', `/api/admin/forms/${state.formId}/fields`, {
      fields: [
        { key: 'a_sama', label: 'A', type: 'TEXT' },
        { key: 'a_sama', label: 'B', type: 'TEXT' },
      ],
    })
    if (res.json?.success) throw new Error('seharusnya ditolak')
    return res.json.code
  })

  await check('PUT SELECT tanpa opsi ditolak', async () => {
    const res = await call('PUT', `/api/admin/forms/${state.formId}/fields`, {
      fields: [{ key: 'pilihan', label: 'Pilihan', type: 'SELECT', isRequired: true }],
    })
    if (res.json?.success) throw new Error('seharusnya ditolak')
    return res.json.code
  })

  await check('POST /api/admin/forms/{id}/activate', async () => {
    const d = expectOk(await call('POST', `/api/admin/forms/${state.formId}/activate`))
    return 'isActive=' + d.isActive
  })

  // --- public page ---
  await check('POST /api/admin/public-pages', async () => {
    const d = expectOk(await call('POST', '/api/admin/public-pages', {
      eventId: state.eventId, title: 'Halaman Audit', subtitle: 'uji',
      allowedQueueTypeIds: [], maxPerIpPerDay: 0, requireCaptcha: false,
    }))
    state.pageId = d.id
    state.publishCode = d.publishCode
    return d.url
  })

  await check('halaman belum terbit menolak akses publik', async () => {
    const saved = cookie
    cookie = ''
    const res = await call('GET', `/api/public/${state.publishCode}`)
    cookie = saved
    if (res.json?.success) throw new Error('seharusnya ditolak')
    return res.json.code
  })

  await check('PATCH /api/admin/public-pages/{id}', async () => {
    const d = expectOk(await call('PATCH', `/api/admin/public-pages/${state.pageId}`, {
      subtitle: 'subjudul diubah', slug: 'audit-' + Date.now(),
    }))
    return d.slug
  })

  await check('POST /api/admin/public-pages/{id}/publish', async () => {
    const d = expectOk(await call('POST', `/api/admin/public-pages/${state.pageId}/publish`, { isPublished: true }))
    return 'isPublished=' + d.isPublished
  })

  await check('GET qr PNG', async () => {
    const res = await fetch(`${BASE}/api/admin/public-pages/${state.pageId}/qr?format=png&size=300`, { headers: { cookie, Origin: BASE } })
    const buf = Buffer.from(await res.arrayBuffer())
    if (res.status !== 200) throw new Error('HTTP ' + res.status)
    if (buf[0] !== 0x89 || buf[1] !== 0x50) throw new Error('bukan berkas PNG')
    return buf.length + ' byte'
  })

  await check('GET qr SVG', async () => {
    const res = await fetch(`${BASE}/api/admin/public-pages/${state.pageId}/qr?format=svg`, { headers: { cookie, Origin: BASE } })
    const text = await res.text()
    if (!text.startsWith('<?xml') && !text.includes('<svg')) throw new Error('bukan SVG: ' + text.slice(0, 60))
    return text.length + ' char'
  })

  await check('POST qr regenerate (rotate code)', async () => {
    const d = expectOk(await call('POST', `/api/admin/public-pages/${state.pageId}/qr`, { rotateCode: true }))
    const old = state.publishCode
    state.publishCode = d.code
    return `v${d.version}, ${old} -> ${d.code}`
  })

  // --- pendaftaran publik pada event audit ---
  await check('GET /api/public/{code} setelah terbit', async () => {
    const saved = cookie
    cookie = ''
    const d = expectOk(await call('GET', `/api/public/${state.publishCode}`))
    cookie = saved
    return `${d.queueTypes.length} layanan, form ${d.form?.fields.length} field, buka=${d.openState.acceptsNewQueue}`
  })

  await check('POST ambil antrean dengan form wajib', async () => {
    const saved = cookie
    cookie = ''
    const res = await call('POST', `/api/public/${state.publishCode}/queue`, {
      queueTypeId: state.queueTypeId,
      values: { full_name: 'Pengunjung Audit', layanan: 'umum' },
    })
    cookie = saved
    const d = expectOk(res)
    state.queueToken = d.token
    return d.queueNumber
  })

  await check('POST antrean dengan opsi SELECT tak dikenal ditolak', async () => {
    const saved = cookie
    cookie = ''
    const res = await call('POST', `/api/public/${state.publishCode}/queue`, {
      queueTypeId: state.queueTypeId,
      values: { full_name: 'X', layanan: 'tidak_ada' },
    })
    cookie = saved
    if (res.json?.success) throw new Error('seharusnya ditolak')
    return res.json.code
  })

  await check('GET /api/public/{code}/status', async () => {
    const saved = cookie
    cookie = ''
    const d = expectOk(await call('GET', `/api/public/${state.publishCode}/status`))
    cookie = saved
    return d.board.length + ' layanan di papan'
  })

  // --- display ---
  await check('POST /api/admin/displays', async () => {
    const d = expectOk(await call('POST', '/api/admin/displays', {
      eventId: state.eventId, name: 'Display Audit', type: 'GLOBAL',
    }))
    state.deviceId = d.id
    state.deviceCode = d.deviceCode
    return d.deviceCode
  })

  await check('POST display QUEUE_TYPE tanpa queueTypeId ditolak', async () => {
    const res = await call('POST', '/api/admin/displays', {
      eventId: state.eventId, name: 'Display Salah', type: 'QUEUE_TYPE',
    })
    if (res.json?.success) throw new Error('seharusnya ditolak')
    return res.json.code
  })

  await check('POST /api/display/{code}/pair', async () => {
    const saved = cookie
    cookie = ''
    const d = expectOk(await call('POST', `/api/display/${state.deviceCode}/pair`))
    cookie = saved
    state.deviceToken = d.deviceToken
    return 'token ' + d.deviceToken.slice(0, 8) + '…'
  })

  await check('pairing kedua kali ditolak', async () => {
    const saved = cookie
    cookie = ''
    const res = await call('POST', `/api/display/${state.deviceCode}/pair`)
    cookie = saved
    if (res.json?.success) throw new Error('seharusnya ditolak')
    return res.json.code
  })

  await check('POST /api/admin/displays/{id}/reset-pairing', async () => {
    const d = expectOk(await call('POST', `/api/admin/displays/${state.deviceId}/reset-pairing`))
    return 'status=' + d.status
  })

  // --- operator pada event audit ---
  await check('operator audit login & panggil antrean', async () => {
    const saved = cookie
    cookie = ''
    await call('POST', '/api/auth/sign-in/email', { email: auditEmail, password: 'rahasia12345' })
    const board = expectOk(await call('GET', `/api/operator/board?queueTypeId=${state.queueTypeId}`))
    const next = expectOk(await call('POST', '/api/operator/queue/next', {
      queueTypeId: state.queueTypeId, counterId: state.counterId,
    }))
    state.calledQueueId = next.id
    const recall = expectOk(await call('POST', `/api/operator/queue/${next.id}/recall`, {}))
    const serving = expectOk(await call('POST', `/api/operator/queue/${next.id}/serving`, {}))
    const done = expectOk(await call('POST', `/api/operator/queue/${next.id}/complete`, {}))
    cookie = saved
    return `board ok (${board.stats.waiting} menunggu) → ${next.queueNumber} → recall ${recall.recallCount}× → ${serving.status} → ${done.status}`
  })

  await check('operator lain tidak bisa akses layanan ini', async () => {
    const saved = cookie
    cookie = ''
    // Pengguna yang dibuat uji ini sendiri — bukan operator demo, yang sejak §28
    // hanya boleh terikat pada satu event.
    await call('POST', '/api/auth/sign-in/email', { email: auditEmail, password: 'password123' })
    const res = await call('GET', `/api/operator/board?queueTypeId=${state.queueTypeId}`)
    cookie = saved
    if (res.json?.success) throw new Error('seharusnya ditolak')
    return res.json.code
  })

  // --- dashboard & queues ---
  await check('GET /api/admin/dashboard', async () => {
    const d = expectOk(await call('GET', `/api/admin/dashboard?eventId=${state.eventId}`))
    return `queue=${d.totals.queues} visitor=${d.totals.visitors} selesai=${d.totals.completed} avgLayanan=${d.averages.serviceSeconds}`
  })

  await check('GET /api/admin/queues', async () => {
    const d = expectOk(await call('GET', `/api/admin/queues?eventId=${state.eventId}`))
    return `${d.items.length}/${d.total} antrean`
  })

  // --- pembersihan / hapus ---
  await check('DELETE /api/admin/assignments/{id}', async () => {
    expectOk(await call('DELETE', `/api/admin/assignments/${state.assignmentId}`))
    return 'terhapus'
  })

  await check('DELETE /api/admin/counters/{id}', async () => {
    expectOk(await call('DELETE', `/api/admin/counters/${state.counterId}`))
    return 'terhapus'
  })

  await check('DELETE /api/admin/queue-types/{id} (ada antrean selesai)', async () => {
    expectOk(await call('DELETE', `/api/admin/queue-types/${state.queueTypeId}`))
    return 'terhapus'
  })

  await check('DELETE /api/admin/public-pages/{id}', async () => {
    expectOk(await call('DELETE', `/api/admin/public-pages/${state.pageId}`))
    return 'terhapus'
  })

  await check('DELETE /api/admin/forms/{id} aktif ditolak', async () => {
    const res = await call('DELETE', `/api/admin/forms/${state.formId}`)
    if (res.json?.success) throw new Error('seharusnya ditolak')
    return res.json.code
  })

  await check('DELETE /api/admin/displays/{id}', async () => {
    expectOk(await call('DELETE', `/api/admin/displays/${state.deviceId}`))
    return 'terhapus'
  })

  await check('DELETE /api/admin/users/{id}', async () => {
    expectOk(await call('DELETE', `/api/admin/users/${state.userId}`))
    return 'terhapus'
  })

  await check('DELETE /api/admin/events/{id}', async () => {
    expectOk(await call('DELETE', `/api/admin/events/${state.eventId}`))
    return 'terhapus'
  })

  await check('hapus akun sendiri ditolak', async () => {
    const me = expectOk(await call('GET', '/api/me'))
    const res = await call('DELETE', `/api/admin/users/${me.user.id}`)
    if (res.json?.success) throw new Error('seharusnya ditolak')
    return res.json.code
  })

  const failed = results.filter(r => !r.ok)
  console.log(`\n${results.length - failed.length}/${results.length} lolos`)
  if (failed.length) {
    console.log('\nGAGAL:')
    for (const f of failed) console.log(`  - ${f.name}: ${f.detail}`)
  }
  process.exit(failed.length ? 1 : 0)
}

main().catch((e) => { console.error('AUDIT CRASH', e); process.exit(2) })
