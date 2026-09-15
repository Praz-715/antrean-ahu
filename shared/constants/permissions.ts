/**
 * Katalog permission RBAC (§12, §26).
 * Role menyimpan kumpulan permission; kode aplikasi selalu memeriksa PERMISSION,
 * tidak pernah memeriksa nama role — kecuali SUPERADMIN yang bypass (§57.6).
 */
export const PERMISSIONS = {
  // dashboard & laporan
  DASHBOARD_VIEW: 'dashboard.view',
  ANALYTICS_VIEW: 'analytics.view',
  REPORT_VIEW: 'report.view',
  REPORT_EXPORT: 'report.export',

  // event
  EVENT_VIEW: 'event.view',
  EVENT_MANAGE: 'event.manage',
  EVENT_CONTROL: 'event.control', // open / pause / resume / close

  // queue type & counter
  QUEUE_TYPE_VIEW: 'queue_type.view',
  QUEUE_TYPE_MANAGE: 'queue_type.manage',
  COUNTER_MANAGE: 'counter.manage',

  // antrean
  QUEUE_VIEW: 'queue.view',
  QUEUE_VIEW_ALL: 'queue.view_all', // lintas assignment
  QUEUE_CALL: 'queue.call',
  QUEUE_RECALL: 'queue.recall',
  QUEUE_SKIP: 'queue.skip',
  QUEUE_COMPLETE: 'queue.complete',
  QUEUE_CANCEL: 'queue.cancel',
  QUEUE_REOPEN: 'queue.reopen', // memanggil ulang antrean COMPLETED (§57.8)

  // visitor & feedback
  VISITOR_VIEW: 'visitor.view',
  VISITOR_EXPORT: 'visitor.export',
  FEEDBACK_VIEW: 'feedback.view',
  FEEDBACK_MODERATE: 'feedback.moderate',

  // user & rbac
  USER_VIEW: 'user.view',
  USER_MANAGE: 'user.manage',
  ROLE_MANAGE: 'role.manage',
  ASSIGNMENT_MANAGE: 'assignment.manage',

  // form & public page
  FORM_VIEW: 'form.view',
  FORM_MANAGE: 'form.manage',
  PUBLIC_PAGE_VIEW: 'public_page.view',
  PUBLIC_PAGE_MANAGE: 'public_page.manage',
  PUBLIC_PAGE_PUBLISH: 'public_page.publish',

  // display & media
  DISPLAY_VIEW: 'display.view',
  DISPLAY_MANAGE: 'display.manage',
  DISPLAY_TEMPLATE_MANAGE: 'display_template.manage',
  MEDIA_VIEW: 'media.view',
  MEDIA_MANAGE: 'media.manage',
  ANNOUNCEMENT_MANAGE: 'announcement.manage',

  // integrasi & sistem
  INTEGRATION_VIEW: 'integration.view',
  INTEGRATION_MANAGE: 'integration.manage',
  SETTING_VIEW: 'setting.view',
  SETTING_MANAGE: 'setting.manage',
  AUDIT_VIEW: 'audit.view',
} as const

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS]

export const PERMISSION_GROUPS: Record<string, Permission[]> = {
  Dashboard: [PERMISSIONS.DASHBOARD_VIEW, PERMISSIONS.ANALYTICS_VIEW, PERMISSIONS.REPORT_VIEW, PERMISSIONS.REPORT_EXPORT],
  Event: [PERMISSIONS.EVENT_VIEW, PERMISSIONS.EVENT_MANAGE, PERMISSIONS.EVENT_CONTROL],
  'Jenis Antrean': [PERMISSIONS.QUEUE_TYPE_VIEW, PERMISSIONS.QUEUE_TYPE_MANAGE, PERMISSIONS.COUNTER_MANAGE],
  Antrean: [
    PERMISSIONS.QUEUE_VIEW,
    PERMISSIONS.QUEUE_VIEW_ALL,
    PERMISSIONS.QUEUE_CALL,
    PERMISSIONS.QUEUE_RECALL,
    PERMISSIONS.QUEUE_SKIP,
    PERMISSIONS.QUEUE_COMPLETE,
    PERMISSIONS.QUEUE_CANCEL,
    PERMISSIONS.QUEUE_REOPEN,
  ],
  Pengunjung: [PERMISSIONS.VISITOR_VIEW, PERMISSIONS.VISITOR_EXPORT, PERMISSIONS.FEEDBACK_VIEW, PERMISSIONS.FEEDBACK_MODERATE],
  Pengguna: [PERMISSIONS.USER_VIEW, PERMISSIONS.USER_MANAGE, PERMISSIONS.ROLE_MANAGE, PERMISSIONS.ASSIGNMENT_MANAGE],
  'Form & Publikasi': [
    PERMISSIONS.FORM_VIEW,
    PERMISSIONS.FORM_MANAGE,
    PERMISSIONS.PUBLIC_PAGE_VIEW,
    PERMISSIONS.PUBLIC_PAGE_MANAGE,
    PERMISSIONS.PUBLIC_PAGE_PUBLISH,
  ],
  Display: [
    PERMISSIONS.DISPLAY_VIEW,
    PERMISSIONS.DISPLAY_MANAGE,
    PERMISSIONS.DISPLAY_TEMPLATE_MANAGE,
    PERMISSIONS.MEDIA_VIEW,
    PERMISSIONS.MEDIA_MANAGE,
    PERMISSIONS.ANNOUNCEMENT_MANAGE,
  ],
  Sistem: [
    PERMISSIONS.INTEGRATION_VIEW,
    PERMISSIONS.INTEGRATION_MANAGE,
    PERMISSIONS.SETTING_VIEW,
    PERMISSIONS.SETTING_MANAGE,
    PERMISSIONS.AUDIT_VIEW,
  ],
}

export const ALL_PERMISSIONS: Permission[] = Object.values(PERMISSIONS)

export const ROLE_KEYS = {
  SUPERADMIN: 'SUPERADMIN',
  ADMIN: 'ADMIN',
  OPERATOR: 'OPERATOR',
  VIEWER: 'VIEWER',
} as const

export type RoleKey = (typeof ROLE_KEYS)[keyof typeof ROLE_KEYS]

/** Permission bawaan tiap role sistem. SUPERADMIN sengaja kosong: ia bypass semua cek. */
export const ROLE_PRESETS: Record<RoleKey, Permission[]> = {
  SUPERADMIN: [],
  ADMIN: ALL_PERMISSIONS.filter(p => p !== PERMISSIONS.QUEUE_REOPEN),
  OPERATOR: [
    PERMISSIONS.QUEUE_VIEW,
    PERMISSIONS.QUEUE_CALL,
    PERMISSIONS.QUEUE_RECALL,
    PERMISSIONS.QUEUE_SKIP,
    PERMISSIONS.QUEUE_COMPLETE,
  ],
  VIEWER: [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.ANALYTICS_VIEW,
    PERMISSIONS.REPORT_VIEW,
    PERMISSIONS.QUEUE_VIEW,
    PERMISSIONS.QUEUE_VIEW_ALL,
    PERMISSIONS.VISITOR_VIEW,
    PERMISSIONS.FEEDBACK_VIEW,
    PERMISSIONS.EVENT_VIEW,
    PERMISSIONS.QUEUE_TYPE_VIEW,
  ],
}
