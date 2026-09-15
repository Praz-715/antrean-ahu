<template>
  <UApp>
    <!-- Bilah progres tipis di puncak halaman: navigasi rute maupun permintaan API -->
    <NuxtLoadingIndicator color="#1b5cf5" :height="3" :throttle="120" />
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
