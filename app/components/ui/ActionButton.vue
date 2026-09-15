<script setup lang="ts">
/**
 * Tombol untuk aksi asinkron: spinner-nya diurus sendiri, jadi setiap halaman
 * tidak perlu membuat ref `loading` satu per satu — dan tidak ada lagi tombol
 * yang diklik tanpa umpan balik.
 *
 * Pemakaian:
 *   <UiActionButton :action="() => hapus(item)" label="Hapus" color="error" />
 *
 * Seluruh prop UButton lainnya diteruskan apa adanya lewat $attrs.
 */
const props = defineProps<{
  action?: () => unknown | Promise<unknown>
  /** Cegah klik ganda selama aksi berjalan (default: ya). */
  once?: boolean
}>()

defineOptions({ inheritAttrs: false })

const pending = ref(false)

async function onClick() {
  if (!props.action) return
  if (pending.value && props.once !== false) return

  pending.value = true
  try {
    await props.action()
  }
  finally {
    pending.value = false
  }
}
</script>

<template>
  <UButton v-bind="$attrs" :loading="pending" @click="onClick">
    <slot />
  </UButton>
</template>
