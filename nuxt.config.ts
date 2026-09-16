/**
 * Klien Prisma hasil generate dibuka dengan baris:
 *
 *   globalThis['__dirname'] = path.dirname(fileURLToPath(import.meta.url))
 *
 * Di dalam bundel Nitro, `import.meta.url` diganti shim `globalThis._importMeta_`,
 * dan pada chunk yang dievaluasi sebelum entri nilainya jatuh ke `file:///_entry.js`.
 * Di Windows URL itu bukan path absolut, jadi `fileURLToPath` melempar
 * `ERR_INVALID_FILE_URL_PATH` dan server hasil build mati sebelum melayani satu
 * permintaan pun (di Linux lolos hanya karena `/_entry.js` masih terbaca absolut).
 *
 * `__dirname` sendiri tidak dipakai: koneksi database memakai driver adapter
 * (`@prisma/adapter-mariadb`), bukan berkas query engine yang perlu dicari di disk.
 * Jadi nilainya cukup diisi direktori kerja proses.
 *
 * Kalau baris itu hilang pada versi Prisma berikutnya, modulnya dibiarkan apa adanya —
 * lebih baik gagal terang-terangan daripada menambal sesuatu yang sudah berubah.
 */
function prismaDirnamePatch() {
  const pattern = /globalThis\[(['"])__dirname\1\]\s*=\s*[\w$]+\.dirname\(\s*fileURLToPath\(\s*import\.meta\.url\s*\)\s*\)/

  return {
    name: 'antrean-prisma-dirname',
    transform(code: string, id: string) {
      if (!id.replace(/\\/g, '/').includes('/generated/prisma/')) return null
      if (!pattern.test(code)) return null
      return {
        code: code.replace(pattern, 'globalThis[\'__dirname\'] = globalThis[\'__dirname\'] ?? process.cwd()'),
        map: null,
      }
    },
  }
}

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },

  modules: ['@nuxt/ui', '@pinia/nuxt', '@nuxt/eslint'],

  css: ['~/assets/css/main.css'],

  app: {
    head: {
      titleTemplate: '%s · Sistem Antrean AHU',
      title: 'Sistem Antrean AHU',
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
        { name: 'description', content: 'Sistem Antrean AHU — Kelola Antrean. Layani Lebih Cepat.' },
        // Warna bilah peramban di ponsel; navy yang sama dengan kepala halaman.
        { name: 'theme-color', content: '#132b48' },
      ],
      /**
       * Lambang AHU TIDAK ada di sini.
       *
       * Ia diimpor komponen `UiBrandLogo` lewat Vite, yang menanamkannya langsung
       * sebagai `data:` URI ke dalam bundel (berkasnya 2,8 KB, di bawah ambang
       * 4 KB). Tidak ada permintaan jaringan yang perlu dipercepat dengan
       * `preload`, dan tidak ada berkas di `public/` yang bisa ditunjuk
       * `apple-touch-icon`.
       */
      link: [{ rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }],
    },
  },

  runtimeConfig: {
    // server-only
    databaseUrl: process.env.DATABASE_URL,
    betterAuthSecret: process.env.BETTER_AUTH_SECRET,
    betterAuthUrl: process.env.BETTER_AUTH_URL,
    appEncryptionKey: process.env.APP_ENCRYPTION_KEY,
    storage: {
      driver: process.env.STORAGE_DRIVER || 'local',
      localPath: process.env.STORAGE_LOCAL_PATH || './storage/uploads',
      publicBase: process.env.STORAGE_PUBLIC_BASE || '/media',
    },
    rateLimit: {
      windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 60_000),
      max: Number(process.env.RATE_LIMIT_MAX || 20),
    },
    turnstileSecretKey: process.env.TURNSTILE_SECRET_KEY || '',

    public: {
      appName: process.env.APP_NAME || 'Sistem Antrean AHU',
      appUrl: process.env.APP_URL || 'http://localhost:3000',
      defaultTimezone: process.env.DEFAULT_TIMEZONE || 'Asia/Jakarta',
      turnstileSiteKey: process.env.TURNSTILE_SITE_KEY || '',
    },
  },

  /**
   * Pickr dimuat dinamis dari komponen pemilih warna, jadi Vite baru menemukannya
   * saat komponen itu dibuka — dan memuat ulang halaman untuk mem-bundle ulang.
   * Disebut di sini supaya sudah siap sejak server dev dinyalakan.
   */
  vite: {
    optimizeDeps: { include: ['@simonwep/pickr'] },
  },

  nitro: {
    // Socket.IO di-bind ke instance Nitro lewat server/plugins/socket.ts
    experimental: { websocket: true },

    /**
     * Runtime Prisma tidak ikut dibundel — dibiarkan sebagai dependensi
     * node_modules biasa (Nitro menyalinnya ke `.output/server/node_modules`).
     * Selain memperkecil chunk, ini menjauhkan kode yang bergantung pada
     * `import.meta.url` dari shim bundler.
     */
    externals: {
      external: ['@prisma/client', '@prisma/adapter-mariadb'],
    },

    rollupConfig: {
      plugins: [prismaDirnamePatch()],
    },
  },

  experimental: {
    /**
     * Tab yang sudah lama terbuka memegang referensi ke chunk JavaScript lama.
     * Setelah server dev membangun ulang — atau setelah deploy baru — chunk itu
     * hilang dan navigasi berikutnya gagal dengan "Failed to fetch dynamically
     * imported module", biasanya disertai halaman yang tidak mau terbuka.
     * Muat ulang otomatis jauh lebih baik daripada layar yang macet.
     */
    emitRouteChunkError: 'automatic-immediate',
  },

  typescript: {
    strict: true,
    typeCheck: false,
  },

  ui: {
    colorMode: true,
  },

  eslint: {
    config: { stylistic: false },
  },
})
