export default defineNuxtRouteMiddleware(async (to) => {
  const { load, me } = useMe()
  await load()

  if (!me.value) {
    return navigateTo({ path: '/login', query: { redirect: to.fullPath } })
  }
})
