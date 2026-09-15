import type { H3Event } from 'h3'
import { prisma } from './prisma'
import { newId } from './id'
import { createLogger } from './logger'

const log = createLogger('audit')

export interface AuditInput {
  organizationId?: string | null
  userId?: string | null
  action: string
  entity: string
  entityId?: string | null
  oldData?: unknown
  newData?: unknown
}

/**
 * Catat aktivitas penting (§37).
 *
 * Sengaja tidak pernah melempar error: kegagalan audit tidak boleh menggagalkan
 * operasi bisnis yang sudah commit. Karena itu pemanggil juga tidak perlu menunggu —
 * gunakan `auditAsync()` di jalur request agar tidak menambah latensi.
 */
export async function audit(event: H3Event | null, input: AuditInput): Promise<void> {
  await writeAudit(
    event
      ? {
          ipAddress: getRequestIP(event, { xForwardedFor: true })?.slice(0, 64) ?? null,
          userAgent: getRequestHeader(event, 'user-agent')?.slice(0, 500) ?? null,
        }
      : { ipAddress: null, userAgent: null },
    input,
  )
}

interface RequestContext { ipAddress: string | null, userAgent: string | null }

async function writeAudit(context: RequestContext, input: AuditInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        id: newId(),
        organizationId: input.organizationId ?? null,
        userId: input.userId ?? null,
        action: input.action,
        entity: input.entity,
        entityId: input.entityId ?? null,
        oldData: (input.oldData ?? undefined) as never,
        newData: (input.newData ?? undefined) as never,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
    })
  }
  catch (error) {
    log.warn('gagal menulis audit log', { action: input.action, message: (error as Error).message })
  }
}

export const AUDIT_ACTIONS = {
  USER_LOGIN: 'USER_LOGIN',
  USER_CREATED: 'USER_CREATED',
  USER_UPDATED: 'USER_UPDATED',
  USER_DELETED: 'USER_DELETED',
  EVENT_CREATED: 'EVENT_CREATED',
  EVENT_UPDATED: 'EVENT_UPDATED',
  EVENT_DELETED: 'EVENT_DELETED',
  EVENT_OPENED: 'EVENT_OPENED',
  EVENT_PAUSED: 'EVENT_PAUSED',
  EVENT_CLOSED: 'EVENT_CLOSED',
  QUEUE_TYPE_CREATED: 'QUEUE_TYPE_CREATED',
  QUEUE_TYPE_UPDATED: 'QUEUE_TYPE_UPDATED',
  QUEUE_TYPE_DELETED: 'QUEUE_TYPE_DELETED',
  COUNTER_CREATED: 'COUNTER_CREATED',
  COUNTER_UPDATED: 'COUNTER_UPDATED',
  COUNTER_DELETED: 'COUNTER_DELETED',
  QUEUE_CREATED: 'QUEUE_CREATED',
  QUEUE_CALLED: 'QUEUE_CALLED',
  QUEUE_RECALLED: 'QUEUE_RECALLED',
  QUEUE_SKIPPED: 'QUEUE_SKIPPED',
  QUEUE_COMPLETED: 'QUEUE_COMPLETED',
  QUEUE_CANCELLED: 'QUEUE_CANCELLED',
  ASSIGNMENT_UPDATED: 'ASSIGNMENT_UPDATED',
  ROLE_CREATED: 'ROLE_CREATED',
  ROLE_UPDATED: 'ROLE_UPDATED',
  ROLE_DELETED: 'ROLE_DELETED',
  FORM_UPDATED: 'FORM_UPDATED',
  PUBLIC_PAGE_PUBLISHED: 'PUBLIC_PAGE_PUBLISHED',
  PUBLIC_PAGE_UNPUBLISHED: 'PUBLIC_PAGE_UNPUBLISHED',
  QR_REGENERATED: 'QR_REGENERATED',
  ANNOUNCEMENT_CREATED: 'ANNOUNCEMENT_CREATED',
  MEDIA_UPLOADED: 'MEDIA_UPLOADED',
  MEDIA_DELETED: 'MEDIA_DELETED',
  PLAYLIST_UPDATED: 'PLAYLIST_UPDATED',
  DISPLAY_TEMPLATE_UPDATED: 'DISPLAY_TEMPLATE_UPDATED',
  DISPLAY_UPDATED: 'DISPLAY_UPDATED',
  EXPORT_REQUESTED: 'EXPORT_REQUESTED',
  SETTING_CHANGED: 'SETTING_CHANGED',
  ORGANIZATION_UPDATED: 'ORGANIZATION_UPDATED',
  TESTIMONIAL_MODERATED: 'TESTIMONIAL_MODERATED',
  TESTIMONIAL_DELETED: 'TESTIMONIAL_DELETED',
  DATA_SOURCE_CREATED: 'DATA_SOURCE_CREATED',
  DATA_SOURCE_UPDATED: 'DATA_SOURCE_UPDATED',
  DATA_SOURCE_DELETED: 'DATA_SOURCE_DELETED',
  DATA_SOURCE_TESTED: 'DATA_SOURCE_TESTED',
} as const

/**
 * Versi tanpa tunggu untuk dipakai di dalam handler API.
 * Konteks request (IP & user agent) diambil lebih dulu karena H3Event tidak boleh
 * disentuh setelah respons terkirim.
 */
export function auditAsync(event: H3Event | null, input: AuditInput): void {
  const context = event
    ? {
        ipAddress: getRequestIP(event, { xForwardedFor: true })?.slice(0, 64) ?? null,
        userAgent: getRequestHeader(event, 'user-agent')?.slice(0, 500) ?? null,
      }
    : { ipAddress: null, userAgent: null }

  void writeAudit(context, input)
}
