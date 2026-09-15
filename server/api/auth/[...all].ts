import { auth } from '../../utils/auth'

/** Semua endpoint Better Auth: /api/auth/sign-in/email, /api/auth/get-session, dst. */
export default defineEventHandler(event => auth.handler(toWebRequest(event)))
