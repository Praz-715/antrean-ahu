<template>
  <div class="min-h-screen bg-slate-50 dark:bg-slate-950">
    <!--
      Pengunjung tidak punya menu akun sama sekali, jadi inilah satu-satunya jalan
      mereka mengganti tema. Mengambang di atas header merek halaman publik.
    -->
    <UiThemeToggle floating size="sm" />
    <slot />
  </div>
</template>
