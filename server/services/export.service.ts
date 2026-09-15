import ExcelJS from 'exceljs'
import { prisma } from '../utils/prisma'
import { errors } from '../utils/response'
import { ERROR_CODES } from '../../shared/constants/errors'
import { newId } from '../utils/id'
import { storage } from '../utils/storage'
import { createLogger } from '../utils/logger'
import { reportService } from './report.service'
import { buildCsv } from './csv'

const log = createLogger('export')

export const EXPORT_TYPES = ['QUEUES', 'VISITORS', 'OPERATORS', 'TESTIMONIALS'] as const
export type ExportType = (typeof EXPORT_TYPES)[number]

export const EXPORT_TYPE_LABEL: Record<ExportType, string> = {
  QUEUES: 'Riwayat Antrean',
  VISITORS: 'Daftar Pengunjung',
  OPERATORS: 'Performa Operator',
  TESTIMONIALS: 'Rating & Testimoni',
}

export interface ExportFilters {
  eventId: string
  from: string
  to: string
  queueTypeId?: string
  status?: string
}

type Row = Record<string, string | number>

function rowStream(organizationId: string, type: ExportType, filters: ExportFilters) {
  switch (type) {
    case 'QUEUES':
      return reportService.streamQueueRows(organizationId, filters)
    case 'VISITORS':
      return reportService.streamVisitorRows(organizationId, filters)
    case 'OPERATORS':
      return reportService.streamOperatorRows(organizationId, filters)
    case 'TESTIMONIALS':
      return reportService.streamTestimonialRows(organizationId, filters)
  }
}

/**
 * Pusat ekspor (§38).
 *
 * Pekerjaan dijalankan di latar belakang: endpoint hanya membuat baris `export_jobs`
 * lalu langsung menjawab, sehingga rentang tanggal panjang tidak membuat permintaan
 * HTTP menggantung. Klien memantau statusnya dan mengunduh setelah selesai.
 */
export const exportService = {
  async list(organizationId: string, userId: string) {
    const jobs = await prisma.exportJob.findMany({
      where: { requestedBy: { organizationId } },
      orderBy: { createdAt: 'desc' },
      take: 30,
      include: { requestedBy: { select: { id: true, name: true } } },
    })

    return jobs.map(job => ({
      ...job,
      isMine: job.requestedById === userId,
      downloadUrl: job.status === 'DONE' ? `/api/admin/exports/${job.id}/download` : null,
    }))
  },

  async getById(organizationId: string, id: string) {
    const job = await prisma.exportJob.findFirst({
      where: { id, requestedBy: { organizationId } },
    })
    if (!job) throw errors.notFound('Pekerjaan ekspor tidak ditemukan')
    return job
  },

  async create(organizationId: string, userId: string, input: {
    type: ExportType
    format: 'CSV' | 'XLSX'
    filters: ExportFilters
  }) {
    const event = await prisma.event.findFirst({
      where: { id: input.filters.eventId, organizationId, deletedAt: null },
      select: { id: true },
    })
    if (!event) throw errors.notFound('Event tidak ditemukan')

    const job = await prisma.exportJob.create({
      data: {
        id: newId(),
        requestedById: userId,
        type: input.type,
        format: input.format,
        filters: input.filters as never,
        status: 'QUEUED',
      },
    })

    // sengaja tidak di-await: pemanggil hanya perlu tahu pekerjaannya sudah antre
    void this.process(organizationId, job.id).catch((error) => {
      log.error('pekerjaan ekspor gagal', { jobId: job.id, message: (error as Error).message })
    })

    return job
  },

  /** Jalankan satu pekerjaan sampai berkasnya tersimpan. */
  async process(organizationId: string, jobId: string) {
    const job = await prisma.exportJob.findUnique({ where: { id: jobId } })
    if (!job || job.status !== 'QUEUED') return

    await prisma.exportJob.update({ where: { id: jobId }, data: { status: 'PROCESSING' } })

    try {
      const type = job.type as ExportType
      const filters = job.filters as unknown as ExportFilters
      const rows: Row[] = []

      for await (const row of rowStream(organizationId, type, filters)) {
        rows.push(row as Row)
        if (rows.length > 100_000) break
      }

      const headers = rows.length ? Object.keys(rows[0]!) : ['Tidak ada data']
      const filePath = job.format === 'XLSX'
        ? await writeXlsx(type, headers, rows)
        : await writeCsv(headers, rows)

      await prisma.exportJob.update({
        where: { id: jobId },
        data: { status: 'DONE', filePath, rowCount: rows.length },
      })

      log.info('ekspor selesai', { jobId, rows: rows.length, format: job.format })
    }
    catch (error) {
      await prisma.exportJob.update({
        where: { id: jobId },
        data: { status: 'FAILED', error: (error as Error).message.slice(0, 500) },
      })
      throw error
    }
  },

  async download(organizationId: string, id: string) {
    const job = await this.getById(organizationId, id)

    if (job.status !== 'DONE' || !job.filePath) {
      throw errors.badRequest(ERROR_CODES.CONFLICT, 'Berkas ekspor belum siap')
    }
    if (!(await storage.exists(job.filePath))) {
      throw errors.notFound('Berkas ekspor sudah tidak tersedia')
    }

    const label = EXPORT_TYPE_LABEL[job.type as ExportType] ?? job.type
    const extension = job.format === 'XLSX' ? 'xlsx' : 'csv'
    const filters = job.filters as unknown as ExportFilters

    return {
      job,
      stream: storage.stream(job.filePath),
      filename: `${label.replaceAll(' ', '-')}-${filters.from}-sd-${filters.to}.${extension}`.toLowerCase(),
      mime: job.format === 'XLSX'
        ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        : 'text/csv; charset=utf-8',
    }
  },

  async remove(organizationId: string, id: string) {
    const job = await this.getById(organizationId, id)
    if (job.filePath) await storage.remove(job.filePath)
    await prisma.exportJob.delete({ where: { id } })
    return job
  },
}

async function writeCsv(headers: string[], rows: Row[]): Promise<string> {
  return storage.save(buildCsv(headers, rows), { folder: 'exports', extension: 'csv' })
}

async function writeXlsx(type: ExportType, headers: string[], rows: Row[]): Promise<string> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'ANTREAN'
  workbook.created = new Date()

  const sheet = workbook.addWorksheet(EXPORT_TYPE_LABEL[type] ?? 'Data')
  sheet.columns = headers.map(header => ({
    header,
    key: header,
    width: Math.min(40, Math.max(14, header.length + 4)),
  }))

  sheet.getRow(1).font = { bold: true }
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } }
  sheet.views = [{ state: 'frozen', ySplit: 1 }]

  for (const row of rows) sheet.addRow(row)

  const buffer = Buffer.from(await workbook.xlsx.writeBuffer())
  return storage.save(buffer, { folder: 'exports', extension: 'xlsx' })
}
