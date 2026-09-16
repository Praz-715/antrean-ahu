<script setup lang="ts">
import { signIn } from '../utils/auth-client'

definePageMeta({ layout: 'auth', middleware: 'guest' })
useHead({ title: 'Masuk' })

const route = useRoute()
const toast = useToast()
const { load, homeRoute } = useMe()

const form = reactive({ email: '', password: '' })

/**
 * Tampilkan kata sandi apa adanya.
 *
 * Kata sandi operator loket biasanya diketik di depan pengunjung dan sering panjang;
 * salah ketik satu huruf hanya terlihat sebagai "kredensial salah" setelah dikirim,
 * lalu dicoba lagi — dan percobaan yang menumpuk membentur pembatas laju masuk.
 *
 * Selalu kembali tersembunyi saat halaman dibuka: keadaan "terlihat" tidak pernah
 * diingat antar kunjungan, karena layar masuk kerap dibiarkan terbuka di meja loket.
 */
const passwordTerlihat = ref(false)
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
    <div class="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-brand-900 p-12 text-white lg:flex">
      <!--
        Dua lapis latar. Gradien navy memberi kedalaman tanpa mengubah warnanya,
        lalu semburat emas tipis dari sudut atas mengikat panel ini ke lambang di
        atasnya. Emas dijaga sangat redup — di atas navy ia mudah berubah dari
        aksen menjadi silau.
      -->
      <div
        class="pointer-events-none absolute inset-0"
        style="background-image: linear-gradient(160deg, #1e3a5f 0%, #132b48 45%, #0a1b30 100%)"
      />
      <div
        class="pointer-events-none absolute inset-0 opacity-[0.10]"
        style="background-image: radial-gradient(circle at 18% 12%, #fed206 0, transparent 42%), radial-gradient(circle at 85% 78%, white 0, transparent 40%)"
      />
      <div class="relative">
        <UiBrandLogo size="lg" wordmark caption="Ditjen Administrasi Hukum Umum" :plate="false" on-dark />
      </div>

      <div class="relative space-y-6">
        <p class="max-w-md text-3xl font-bold leading-tight">
          Selamat Datang<br>Di Sistem Antrean AHU
        </p>
        <p class="max-w-md text-white/70">
          Satu sistem antrean untuk seluruh layanan Direktorat Jenderal Administrasi
          Hukum Umum.
        </p>
      </div>

      <p class="relative text-sm text-white/50">
        © {{ new Date().getFullYear() }} Sistem Antrean AHU
      </p>
    </div>

    <!-- Panel form -->
    <div class="flex w-full items-center justify-center p-6 lg:w-1/2">
      <div class="w-full max-w-sm">
        <div class="mb-8 lg:hidden">
          <UiBrandLogo size="md" wordmark caption="Ditjen AHU" />
        </div>

        <h1 class="text-2xl font-bold tracking-tight">
          Login ke Sistem Antrean AHU
        </h1>

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
              :type="passwordTerlihat ? 'text' : 'password'"
              autocomplete="current-password"
              placeholder="••••••••"
              icon="i-lucide-lock"
              size="lg"
              class="w-full"
              required
            >
              <template #trailing>
                <!--
                  `type="button"` wajib: tombol di dalam form tanpa tipe eksplisit
                  dianggap tombol kirim, jadi menekan mata justru mencoba masuk.

                  Namanya ikut berubah, bukan tetap "Tampilkan kata sandi": pembaca
                  layar mengumumkan nama tombol, dan nama yang tidak berubah membuat
                  penggunanya tidak tahu keadaan mana yang sedang berlaku. `aria-pressed`
                  melengkapinya untuk pembaca layar yang mengumumkan status tekan.
                -->
                <UButton
                  type="button"
                  variant="link"
                  color="neutral"
                  size="sm"
                  :icon="passwordTerlihat ? 'i-lucide-eye-off' : 'i-lucide-eye'"
                  :aria-label="passwordTerlihat ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'"
                  :title="passwordTerlihat ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'"
                  :aria-pressed="passwordTerlihat"
                  @click="passwordTerlihat = !passwordTerlihat"
                />
              </template>
            </UInput>
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

       
      </div>
    </div>
  </div>
</template>
