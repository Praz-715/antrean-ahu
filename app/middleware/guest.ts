export default defineNuxtRouteMiddleware(async () => {
  const { load, me, homeRoute } = useMe()
  await load()
  if (me.value) return navigateTo(homeRoute.value)
})
