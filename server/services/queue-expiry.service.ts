import type { Prisma } from '../../generated/prisma/client'
import { prisma } from '../utils/prisma'
import { newId } from '../utils/id'
import type { BroadcastableQueue } from '../realtime/queue-broadcast'

type Tx = Prisma.TransactionClient

/**
 * Nomor hangus karena terlewat (§58).
 *
 * Pengunjung memegang A007 sementara layar sudah memanggil A010. Selama nomornya
 * masih WAITING atau SKIPPED ia berhak dipanggil kapan saja, dan antrean fisik di
 * depan loket jadi tidak pernah benar-benar maju: petugas menunggu orang yang
 * mungkin sudah pulang. Aturan ini memberi batas — setelah sekian nomor lewat,
 * nomornya hangus dan pengunjung mengambil nomor baru.
 *
 * YANG DIHITUNG "melewati" adalah nomor di layanan dan tanggal yang sama yang:
 *   - sudah pernah dipanggil (`called_at` terisi), dan
 *   - urutannya di BELAKANG nomor ini, dan
 *   - prioritasnya tidak lebih tinggi.
 *
 * Syarat terakhir itu penting: nomor prioritas (lansia, disabilitas) memang
 * didahulukan oleh `ORDER BY priority DESC`, dan pemegang nomor biasa tidak
 * kehilangan gilirannya hanya karena sistem mendahulukan orang lain — gilirannya
 * belum lewat, baru tertunda.
 */
const SYARAT_TERLEWAT = `
  SELECT COUNT(*) FROM queues x
  WHERE x.queue_type_id = q.queue_type_id
    AND x.service_date = q.service_date
    AND x.deleted_at IS NULL
    AND x.called_at IS NOT NULL
    AND x.sequence_number > q.sequence_number
    AND x.priority <= q.priority
`

/** Berapa nomor yang sudah melewati antrean ini. */
export async function hitungTerlewat(queue: {
  queueTypeId: string
  serviceDate: Date
  sequenceNumber: number
  priority: number
}) {
  return prisma.queue.count({
    where: {
      queueTypeId: queue.queueTypeId,
      serviceDate: queue.serviceDate,
      deletedAt: null,
      calledAt: { not: null },
      sequenceNumber: { gt: queue.sequenceNumber },
      priority: { lte: queue.priority },
    },
  })
}

/**
 * Hanguskan semua nomor yang sudah terlewat pada satu layanan.
 *
 * Dijalankan di dalam transaksi pemanggilan: satu-satunya cara sebuah nomor jadi
 * terlewat adalah ada nomor lain yang dipanggil, jadi di sinilah pemeriksaannya
 * paling murah sekaligus paling tepat waktu. Tidak ada penjadwal yang harus hidup,
 * dan halaman pengunjung tidak perlu menghitung ulang sendiri.
 */
export async function hanguskanTerlewat(tx: Tx, params: {
  queueTypeId: string
  serviceDateStr: string
  batas: number
  operatorId?: string | null
}) {
  if (params.batas <= 0) return []

  const terlewat = await tx.$queryRawUnsafe<Array<{ id: string, status: string, queue_number: string, lewat: bigint }>>(
    `
      SELECT q.id, q.status, q.queue_number, (${SYARAT_TERLEWAT}) AS lewat
      FROM queues q
      WHERE q.queue_type_id = ?
        AND q.service_date = ?
        AND q.deleted_at IS NULL
        AND q.status IN ('WAITING', 'SKIPPED')
      HAVING lewat >= ?
    `,
    params.queueTypeId,
    params.serviceDateStr,
    params.batas,
  )

if (!terlewat.length) return []

  const ids = terlewat.map(r => r.id)
  await tx.queue.updateMany({
    where: { id: { in: ids }, status: { in: ['WAITING', 'SKIPPED'] } },
    data: { status: 'EXPIRED', finishedAt: new Date() },
  })

  await tx.queueEvent.createMany({
    data: terlewat.map(r => ({
      id: newId(),
      queueId: r.id,
      eventType: 'EXPIRED',
      previousStatus: r.status as 'WAITING' | 'SKIPPED',
      newStatus: 'EXPIRED' as const,
      operatorId: params.operatorId ?? null,
      metadata: { dilewati: Number(r.lewat), batas: params.batas },
    })),
  })

  /**
   * Barisnya diambil ulang lengkap dengan relasi supaya pemanggil bisa
   * menyiarkannya: pengunjung hanya berlangganan kamar nomornya sendiri, jadi
   * tanpa siaran ini halaman tiketnya baru tahu nomornya hangus saat dimuat ulang.
   */
  return tx.queue.findMany({
    where: { id: { in: ids } },
    include: {
      queueType: { select: { id: true, code: true, name: true, color: true } },
      counter: { select: { id: true, code: true, name: true } },
      operator: { select: { id: true, name: true } },
      visitor: { select: { fullName: true } },
    },
  }) as Promise<BroadcastableQueue[]>
}
