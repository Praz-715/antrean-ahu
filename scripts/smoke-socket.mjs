/**
 * Uji handshake socket display sebelum & sesudah pairing.
 * Jalankan: node audit-socket.mjs <deviceCode>
 */
import { io } from 'socket.io-client'

/** Alamat server yang diuji; timpa dengan SMOKE_BASE untuk menguji hasil build. */
const BASE = process.env.SMOKE_BASE || 'http://localhost:3000'
const deviceCode = process.argv[2]

function connect(auth, label) {
  return new Promise((resolve) => {
    const socket = io(BASE, {
      path: '/socket.io',
      auth,
      transports: ['polling', 'websocket'],
      reconnection: false,
      timeout: 8000,
    })
    let settled = false
    const done = (result) => {
      if (settled) return
      settled = true
      socket.close()
      console.log(`${result.ok ? 'OK  ' : 'FAIL'}  ${label} — ${result.detail}`)
      resolve(result)
    }
    socket.on('state.snapshot', d => done({ ok: true, detail: 'tersambung, role=' + d.role }))
    socket.on('error', e => done({ ok: false, detail: 'ditolak: ' + (e?.message ?? JSON.stringify(e)) }))
    socket.on('disconnect', r => done({ ok: false, detail: 'diputus server (' + r + ')' }))
    socket.on('connect_error', e => done({ ok: false, detail: 'connect_error: ' + e.message }))
    setTimeout(() => done({ ok: false, detail: 'timeout' }), 9000)
  })
}

async function main() {
  console.log('=== sebelum pairing ===')
  await connect({ role: 'display', deviceCode }, 'display tanpa token (belum dipasangkan)')

  console.log('\n=== lakukan pairing ===')
  const res = await fetch(`${BASE}/api/display/${deviceCode}/pair`, {
    method: 'POST',
    headers: { Origin: BASE },
  })
  const body = await res.json()
  const token = body?.data?.deviceToken
  console.log(body.success ? `pairing berhasil, token ${token.slice(0, 10)}…` : `pairing gagal: ${body.message}`)

  console.log('\n=== sesudah pairing ===')
  await connect({ role: 'display', deviceCode }, 'display TANPA token (yang dikirim halaman saat ini)')
  if (token) await connect({ role: 'display', deviceCode, deviceToken: token }, 'display DENGAN token')
}

main()
