import 'dotenv/config'

// Seluruh test integrasi memakai database terpisah supaya data dev tidak tersentuh.
if (process.env.DATABASE_URL_TEST) {
  process.env.DATABASE_URL = process.env.DATABASE_URL_TEST
}
process.env.NODE_ENV = 'test'
process.env.APP_ENCRYPTION_KEY ||= '0'.repeat(64)
