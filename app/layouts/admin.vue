<script setup lang="ts">
import { signOut } from '../utils/auth-client'
import { PERMISSIONS } from '#shared/constants/permissions'

const { me, can, reset } = useMe()
const route = useRoute()

interface NavItem {
  label: string
  icon: string
  to?: string
  permission?: string[]
  children?: NavItem[]
}

/** Struktur menu superadmin (§26). Item disaring berdasarkan permission. */
const navigation: NavItem[] = [
  {
    label: 'Dashboard',
    icon: 'i-lucide-layout-dashboard',
    to: '/admin/dashboard',
    permission: [PERMISSIONS.DASHBOARD_VIEW],
  },
  {
    label: 'Antrean',
    icon: 'i-lucide-list-ordered',
    permission: [PERMISSIONS.QUEUE_VIEW, PERMISSIONS.QUEUE_TYPE_VIEW],
    children: [
      { label: 'Antrean Live', icon: 'i-lucide-activity', to: '/admin/live-queue', permission: [PERMISSIONS.QUEUE_VIEW] },
      { label: 'Jenis Antrean', icon: 'i-lucide-tags', to: '/admin/queue-types', permission: [PERMISSIONS.QUEUE_TYPE_VIEW] },
      { label: 'Loket', icon: 'i-lucide-door-open', to: '/admin/counters', permission: [PERMISSIONS.QUEUE_TYPE_VIEW] },
      { label: 'Riwayat Antrean', icon: 'i-lucide-history', to: '/admin/queue-history', permission: [PERMISSIONS.QUEUE_VIEW] },
    ],
  },
  {
    label: 'Event / Sesi',
    icon: 'i-lucide-calendar-days',
    to: '/admin/events',
    permission: [PERMISSIONS.EVENT_VIEW],
  },
  {
    label: 'Pengunjung',
    icon: 'i-lucide-users',
    permission: [PERMISSIONS.VISITOR_VIEW, PERMISSIONS.FEEDBACK_VIEW],
    children: [
      { label: 'Daftar Pengunjung', icon: 'i-lucide-user-round', to: '/admin/visitors', permission: [PERMISSIONS.VISITOR_VIEW] },
      { label: 'Rating & Testimoni', icon: 'i-lucide-star', to: '/admin/feedback', permission: [PERMISSIONS.FEEDBACK_VIEW] },
    ],
  },
  {
    label: 'Operator',
    icon: 'i-lucide-headset',
    permission: [PERMISSIONS.USER_VIEW, PERMISSIONS.ASSIGNMENT_MANAGE],
    children: [
      { label: 'Pengguna', icon: 'i-lucide-user-cog', to: '/admin/operators', permission: [PERMISSIONS.USER_VIEW] },
      { label: 'Role & Izin', icon: 'i-lucide-shield-check', to: '/admin/roles', permission: [PERMISSIONS.ROLE_MANAGE] },
      { label: 'Penempatan Operator', icon: 'i-lucide-link', to: '/admin/assignments', permission: [PERMISSIONS.ASSIGNMENT_MANAGE] },
    ],
  },
  {
    label: 'Publikasi',
    icon: 'i-lucide-globe',
    permission: [PERMISSIONS.PUBLIC_PAGE_VIEW, PERMISSIONS.FORM_VIEW],
    children: [
      { label: 'Halaman Publik', icon: 'i-lucide-qr-code', to: '/admin/public-pages', permission: [PERMISSIONS.PUBLIC_PAGE_VIEW] },
      { label: 'Form Builder', icon: 'i-lucide-clipboard-list', to: '/admin/forms', permission: [PERMISSIONS.FORM_VIEW] },
    ],
  },
  {
    label: 'Display',
    icon: 'i-lucide-monitor',
    permission: [PERMISSIONS.DISPLAY_VIEW, PERMISSIONS.MEDIA_VIEW],
    children: [
      { label: 'Perangkat Display', icon: 'i-lucide-tv', to: '/admin/displays', permission: [PERMISSIONS.DISPLAY_VIEW] },
      { label: 'Pengumuman', icon: 'i-lucide-megaphone', to: '/admin/announcements', permission: [PERMISSIONS.ANNOUNCEMENT_MANAGE] },
      { label: 'Display Builder', icon: 'i-lucide-layout-template', to: '/admin/display-builder', permission: [PERMISSIONS.DISPLAY_TEMPLATE_MANAGE] },
      { label: 'Media Library', icon: 'i-lucide-image', to: '/admin/media', permission: [PERMISSIONS.MEDIA_VIEW] },
    ],
  },
  {
    label: 'Sistem',
    icon: 'i-lucide-settings',
    permission: [PERMISSIONS.SETTING_VIEW, PERMISSIONS.AUDIT_VIEW, PERMISSIONS.INTEGRATION_VIEW],
    children: [
      { label: 'Integrasi', icon: 'i-lucide-plug', to: '/admin/integrations', permission: [PERMISSIONS.INTEGRATION_VIEW] },
      { label: 'Laporan', icon: 'i-lucide-file-bar-chart', to: '/admin/reports', permission: [PERMISSIONS.REPORT_VIEW] },
      { label: 'Pengaturan', icon: 'i-lucide-sliders-horizontal', to: '/admin/settings', permission: [PERMISSIONS.SETTING_VIEW] },
      { label: 'Audit Log', icon: 'i-lucide-scroll-text', to: '/admin/audit-logs', permission: [PERMISSIONS.AUDIT_VIEW] },
    ],
  },
]

function visible(item: NavItem): boolean {
  if (!item.permission?.length) return true
  return can(...(item.permission as never[]))
}

const menu = computed(() =>
  navigation
    .filter(visible)
    .map(item => ({ ...item, children: item.children?.filter(visible) }))
    .filter(item => item.to || item.children?.length),
)

const sidebarOpen = ref(false)

function isActive(path?: string) {
  if (!path) return false
  return route.path === path || route.path.startsWith(path + '/')
}

const openGroups = ref<Record<string, boolean>>({})
watchEffect(() => {
  for (const item of menu.value) {
    if (item.children?.some(c => isActive(c.to)) && openGroups.value[item.label] === undefined) {
      openGroups.value[item.label] = true
    }
  }
})

async function onSignOut() {
  await signOut()
  reset()
  await navigateTo('/login')
}

const userMenu = computed(() => [
  [{ label: me.value?.user.name ?? '', type: 'label' as const }],
  [
    { label: 'Buka halaman operator', icon: 'i-lucide-headset', to: '/operator' },
    { label: 'Pengaturan', icon: 'i-lucide-settings', to: '/admin/settings' },
  ],
  [{ label: 'Keluar', icon: 'i-lucide-log-out', color: 'error' as const, onSelect: onSignOut }],
])
</script>

<template>
  <div class="min-h-screen bg-slate-50 dark:bg-slate-950">
    <!-- Sidebar -->
    <aside
      class="fixed inset-y-0 left-0 z-40 w-64 -translate-x-full border-r border-slate-200 bg-white transition-transform lg:translate-x-0 dark:border-slate-800 dark:bg-slate-900"
      :class="{ 'translate-x-0': sidebarOpen }"
    >
      <div class="flex h-16 items-center gap-2 border-b border-slate-200 px-5 dark:border-slate-800">
        <UIcon name="i-lucide-layout-list" class="size-6 text-brand-600" />
        <span class="text-lg font-extrabold tracking-tight">ANTREAN</span>
      </div>

      <nav class="h-[calc(100vh-4rem)] space-y-1 overflow-y-auto p-3">
        <template v-for="item in menu" :key="item.label">
          <NuxtLink
            v-if="item.to"
            :to="item.to"
            class="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors"
            :class="isActive(item.to)
              ? 'bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300'
              : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'"
            @click="sidebarOpen = false"
          >
            <UIcon :name="item.icon" class="size-4.5 shrink-0" />
            {{ item.label }}
          </NuxtLink>

          <div v-else>
            <button
              type="button"
              class="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
              @click="openGroups[item.label] = !openGroups[item.label]"
            >
              <UIcon :name="item.icon" class="size-4.5 shrink-0" />
              <span class="flex-1 text-left">{{ item.label }}</span>
              <UIcon
                name="i-lucide-chevron-down"
                class="size-4 transition-transform"
                :class="{ 'rotate-180': openGroups[item.label] }"
              />
            </button>

            <div v-show="openGroups[item.label]" class="mt-1 space-y-1 pl-4">
              <NuxtLink
                v-for="child in item.children"
                :key="child.label"
                :to="child.to!"
                class="flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors"
                :class="isActive(child.to)
                  ? 'bg-brand-50 font-medium text-brand-700 dark:bg-brand-950 dark:text-brand-300'
                  : 'text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'"
                @click="sidebarOpen = false"
              >
                <UIcon :name="child.icon" class="size-4 shrink-0" />
                {{ child.label }}
              </NuxtLink>
            </div>
          </div>
        </template>
      </nav>
    </aside>

    <div
      v-if="sidebarOpen"
      class="fixed inset-0 z-30 bg-slate-900/40 lg:hidden"
      @click="sidebarOpen = false"
    />

    <!-- Konten -->
    <div class="lg:pl-64">
      <header class="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur dark:border-slate-800 dark:bg-slate-900/90">
        <UButton
          class="lg:hidden"
          icon="i-lucide-menu"
          variant="ghost"
          color="neutral"
          @click="sidebarOpen = true"
        />

        <div class="min-w-0 flex-1">
          <p class="truncate text-sm font-medium text-slate-500">
            {{ me?.organization?.name ?? 'ANTREAN' }}
          </p>
        </div>

        <UButton
          to="/admin/displays"
          variant="ghost"
          color="neutral"
          icon="i-lucide-monitor-play"
          class="hidden sm:inline-flex"
          label="Display"
        />

        <UiThemeToggle />

        <UDropdownMenu :items="userMenu">
          <UButton variant="ghost" color="neutral" trailing-icon="i-lucide-chevron-down">
            <UAvatar
              :alt="me?.user.name"
              size="xs"
              :ui="{ root: 'bg-brand-100 text-brand-700 dark:bg-brand-900 dark:text-brand-200' }"
            />
            <span class="hidden max-w-32 truncate sm:inline">{{ me?.user.name }}</span>
          </UButton>
        </UDropdownMenu>
      </header>

      <main class="p-4 sm:p-6">
        <slot />
      </main>
    </div>
  </div>
</template>
