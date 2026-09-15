import { PERMISSIONS } from '#shared/constants/permissions'

/** Area /admin: butuh minimal satu izin baca dashboard/event. Operator murni ditolak. */
export default defineNuxtRouteMiddleware(async (to) => {
  const { load, me, can } = useMe()
  await load()

  if (!me.value) return navigateTo({ path: '/login', query: { redirect: to.fullPath } })

  const allowed = can(
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.EVENT_VIEW,
    PERMISSIONS.QUEUE_VIEW_ALL,
    PERMISSIONS.USER_VIEW,
  )
  if (!allowed) return navigateTo('/operator')
})
