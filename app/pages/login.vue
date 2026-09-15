<script setup lang="ts">
import { signIn } from '../utils/auth-client'

definePageMeta({ layout: 'auth', middleware: 'guest' })
useHead({ title: 'Masuk' })

const route = useRoute()
const toast = useToast()
const { load, homeRoute } = useMe()

const form = reactive({ email: '', password: '' })
const loading = ref(false)
const errorMessage = ref('')

/**
 * Verifikasi geser muncul setelah tombol Masuk ditekan, bukan sebagai isian ketiga
 * di dalam formulir: orang yang mengetik email dan kata sandi dengan benar tidak
 * perlu diminta menyelesaikan teka-teki lebih dulu untuk tahu apakah datanya sudah
 * betul. Servernya menolak permintaan masuk tanpa tiket, jadi jendela ini tidak
 * bisa dilewati dengan mengubah halaman.
 */
const captcha = ref<{ minta: () => Promise<string | null> } | null>(null)

/**
 * Terjemahkan galat dari Better Auth.
 *
 * Pesan bawaannya berbahasa Inggris ("Too many requests. Please try again later."),
 * dan sebelumnya diteruskan apa adanya ke pengguna — janggal pada antarmuka yang
 * seluruhnya berbahasa Indonesia, dan justru pada saat pengguna paling butuh
 * penjelasan yang jelas.
 */
function loginErrorMessage(error: { message?: string, status?: number }) {
  if (error.status === 429 || /too many requests/i.test(error.message ?? '')) {
    return 'Terlalu banyak percobaan masuk. Tunggu sebentar, lalu coba lagi.'
  }
  if (/invalid email or password/i.test(error.message ?? '')) {
    return 'Email atau kata sandi salah'
  }
  if (/user not found/i.test(error.message ?? '')) {
    return 'Akun dengan email tersebut tidak ditemukan'
  }
  if (/email not verified/i.test(error.message ?? '')) {
    return 'Email Anda belum diverifikasi'
  }
  if (/failed to fetch|network/i.test(error.message ?? '')) {
    return 'Tidak dapat terhubung ke server. Periksa koneksi Anda.'
  }
  return error.message || 'Gagal masuk. Coba lagi.'
}

async function onSubmit() {
  if (loading.value) return
  errorMessage.value = ''

  const tiket = await captcha.value?.minta()
  // Jendela ditutup tanpa menyelesaikan teka-teki — tidak ada yang perlu dikabarkan.
  if (!tiket) return

  loading.value = true

  const { error } = await signIn.email({
    email: form.email.trim(),
    password: form.password,
    fetchOptions: { headers: { 'x-captcha-token': tiket } },
  })

  if (error) {
    errorMessage.value = loginErrorMessage(error)
    loading.value = false
    return
  }

  const me = await load(true)
  if (!me) {
    errorMessage.value = 'Akun Anda tidak aktif. Hubungi administrator.'
    loading.value = false
    return
  }

  toast.add({ title: `Selamat datang, ${me.user.name}`, color: 'success', icon: 'i-lucide-check-circle' })
  await navigateTo((route.query.redirect as string) || homeRoute.value)
}
</script>

<template>
  <div class="flex min-h-screen">
    <!-- Panel brand -->
    <div class="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-brand-700 p-12 text-white lg:flex">
      <div
        class="pointer-events-none absolute inset-0 opacity-20"
        style="background-image: radial-gradient(circle at 20% 20%, white 0, transparent 45%), radial-gradient(circle at 80% 70%, white 0, transparent 40%)"
      />
      <div class="relative">
        <div class="flex items-center gap-2 text-xl font-extrabold tracking-tight">
          <UIcon name="i-lucide-layout-list" class="size-7" />
          ANTREAN
        </div>
      </div>

      <div class="relative space-y-6">
        <p class="max-w-md text-3xl font-bold leading-tight">
          Kelola Antrean.<br>Layani Lebih Cepat.
        </p>
        <p class="max-w-md text-white/70">
          Satu sistem antrean untuk rumah sakit, instansi, bank, kampus, atau event apa pun —
          jenis layanan, formulir, dan tampilan display semuanya bisa Anda atur sendiri.
        </p>
        <div class="flex gap-8 pt-2">
          <div>
            <div class="queue-number text-3xl">A023</div>
            <div class="text-xs uppercase tracking-widest text-white/60">Sedang dilayani</div>
          </div>
          <div>
            <div class="queue-number text-3xl">12m</div>
            <div class="text-xs uppercase tracking-widest text-white/60">Rata-rata tunggu</div>
          </div>
        </div>
      </div>

      <p class="relative text-sm text-white/50">
        © {{ new Date().getFullYear() }} ANTREAN
      </p>
    </div>

    <!-- Panel form -->
    <div class="flex w-full items-center justify-center p-6 lg:w-1/2">
      <div class="w-full max-w-sm">
        <div class="mb-8 lg:hidden">
          <div class="flex items-center gap-2 text-xl font-extrabold">
            <UIcon name="i-lucide-layout-list" class="size-6 text-brand-600" />
            ANTREAN
          </div>
        </div>

        <h1 class="text-2xl font-bold tracking-tight">
          Masuk ke akun Anda
        </h1>
        <p class="mt-1 text-sm text-slate-500">
          Gunakan akun administrator atau operator yang telah didaftarkan.
        </p>

        <UAlert
          v-if="errorMessage"
          class="mt-6"
          color="error"
          variant="soft"
          icon="i-lucide-alert-circle"
          :description="errorMessage"
        />

        <form class="mt-6 space-y-4" @submit.prevent="onSubmit">
          <UFormField label="Email" name="email" required>
            <UInput
              v-model="form.email"
              type="email"
              autocomplete="email"
              placeholder="nama@instansi.go.id"
              icon="i-lucide-mail"
              size="lg"
              class="w-full"
              required
            />
          </UFormField>

          <UFormField label="Kata Sandi" name="password" required>
            <UInput
              v-model="form.password"
              type="password"
              autocomplete="current-password"
              placeholder="••••••••"
              icon="i-lucide-lock"
              size="lg"
              class="w-full"
              required
            />
          </UFormField>

          <UButton
            type="submit"
            size="lg"
            block
            :loading="loading"
            label="Masuk"
            icon="i-lucide-log-in"
          />
        </form>

        <UiSliderCaptcha ref="captcha" purpose="login" />

        <div class="mt-8 rounded-lg border border-dashed border-slate-300 p-4 text-xs text-slate-500 dark:border-slate-700">
          <p class="mb-2 font-semibold text-slate-600 dark:text-slate-400">
            Akun demo (development)
          </p>
          <ul class="space-y-1 font-mono">
            <li>superadmin@antrean.local · password123</li>
            <li>operator1@antrean.local · password123</li>
          </ul>
        </div>
      </div>
    </div>
  </div>
</template>
