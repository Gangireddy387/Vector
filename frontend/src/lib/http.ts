import axios, { AxiosError } from 'axios'

export const TOKEN_STORAGE_KEY = 'vector.token'
/** The portal's super admin signs in separately, so a super-admin tab and a normal account can be open side by side. */
export const SUPER_ADMIN_TOKEN_KEY = 'vector.superAdminToken'
/** The organization this browser is working in; sent with every request so data stays inside it. */
export const ORGANIZATION_STORAGE_KEY = 'vector.organization'

/** Partner embed sessions live in sessionStorage so they never overwrite the normal tab’s localStorage login. */
export const EMBED_FLAG_KEY = 'vector.embed'
export const EMBED_TOKEN_KEY = 'vector.embed.token'
export const EMBED_ORG_KEY = 'vector.embed.organization'
export const EMBED_PK_KEY = 'vector.embed.pk'

export const isSuperAdminPath = (path: string) => /^\/super-?admin(\/|$|\?)/.test(path)

/**
 * Which stored sign-in this tab uses: super-admin pages use the super admin's, everything else (app pages,
 * organization links from emails) the normal account's, so a link never opens as the super admin by accident.
 */
function initialTokenKey() {
  const { pathname, search } = window.location
  const redirect = new URLSearchParams(search).get('redirect') ?? ''
  return isSuperAdminPath(pathname) || isSuperAdminPath(redirect) ? SUPER_ADMIN_TOKEN_KEY : TOKEN_STORAGE_KEY
}

let tokenKey = initialTokenKey()
export const currentTokenKey = () => tokenKey
export const isSuperAdminTab = () => tokenKey === SUPER_ADMIN_TOKEN_KEY
export const useTokenKey = (key: typeof TOKEN_STORAGE_KEY | typeof SUPER_ADMIN_TOKEN_KEY) => (tokenKey = key)

/** True when Vector is running inside another app’s iframe (HRMS, etc.). */
export function isInIframe() {
  if (typeof window === 'undefined') return false
  try {
    return window.self !== window.top
  } catch {
    // Cross-origin parent blocks access to window.top — that still means we are framed.
    return true
  }
}

/**
 * True for partner-embed sessions: iframe, /embed boot, or the embed flag.
 * Those sessions MUST use sessionStorage only so they never share / overwrite the normal tab login in localStorage.
 */
export function isEmbedSession() {
  if (isInIframe()) return true
  try {
    if (sessionStorage.getItem(EMBED_FLAG_KEY) === '1') return true
  } catch {
    /* private mode */
  }
  // Before EmbedBootPage sets the flag, /embed must not pull the normal localStorage user.
  return typeof window !== 'undefined' && window.location.pathname === '/embed'
}

/** Marks this browsing context as an embed session (safe to call repeatedly). */
export function markEmbedSession() {
  try {
    sessionStorage.setItem(EMBED_FLAG_KEY, '1')
  } catch {
    /* ignore */
  }
}

export function getStoredToken() {
  if (isEmbedSession()) {
    try {
      return sessionStorage.getItem(EMBED_TOKEN_KEY)
    } catch {
      return null
    }
  }
  return localStorage.getItem(tokenKey)
}

/** Writes the active session token to the right store (sessionStorage for embed, localStorage otherwise). */
export function setStoredToken(value: string | null) {
  if (isEmbedSession()) {
    markEmbedSession()
    try {
      if (value) sessionStorage.setItem(EMBED_TOKEN_KEY, value)
      else sessionStorage.removeItem(EMBED_TOKEN_KEY)
    } catch {
      /* ignore */
    }
    return
  }
  if (value) localStorage.setItem(tokenKey, value)
  else localStorage.removeItem(tokenKey)
}

export function getStoredOrganizationId() {
  if (isEmbedSession()) {
    try {
      return sessionStorage.getItem(EMBED_ORG_KEY)
    } catch {
      return null
    }
  }
  if (isSuperAdminTab()) return null
  return localStorage.getItem(ORGANIZATION_STORAGE_KEY)
}

export function setStoredOrganizationId(value: string | null) {
  if (isEmbedSession()) {
    markEmbedSession()
    try {
      if (value) sessionStorage.setItem(EMBED_ORG_KEY, value)
      else sessionStorage.removeItem(EMBED_ORG_KEY)
    } catch {
      /* ignore */
    }
    return
  }
  if (isSuperAdminTab()) return
  if (value) localStorage.setItem(ORGANIZATION_STORAGE_KEY, value)
  else localStorage.removeItem(ORGANIZATION_STORAGE_KEY)
}

export const http = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? '/api',
  timeout: 30000,
})

/** Server paths like "/api/avatars/x.png" point at the API origin, which may differ from the app's in production. */
export function assetUrl(path?: string | null) {
  if (!path) return undefined
  const base = import.meta.env.VITE_API_URL ?? ''
  return /^https?:\/\//.test(base) && path.startsWith('/') ? `${new URL(base).origin}${path}` : path
}

http.interceptors.request.use((request) => {
  const token = getStoredToken()
  // Callers may set Authorization explicitly (e.g. passworded public share access).
  if (token && !request.headers.Authorization) request.headers.Authorization = `Bearer ${token}`
  const organizationId = getStoredOrganizationId()
  if (organizationId) request.headers['X-Organization-Id'] = organizationId
  return request
})

type UnauthorizedHandler = () => void
let onUnauthorized: UnauthorizedHandler | null = null

/** Registered by the auth store so an expired session signs the user out everywhere. */
export const setUnauthorizedHandler = (handler: UnauthorizedHandler) => {
  onUnauthorized = handler
}

/** Public guest endpoints — a 401 there is a bad password / unlock failure, not a signed-out session. */
const isPublicGuestRoute = (url?: string) =>
  Boolean(
    url &&
      (/^\/share-links\//.test(url) ||
        /^\/intake-forms\//.test(url) ||
        /^\/organizations\/by-slug\//.test(url) ||
        /^\/pricing/.test(url) ||
        /^\/legal/.test(url)),
  )

http.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    const url = error.config?.url ?? ''
    const isAuthRoute = url.startsWith('/auth/')
    if (error.response?.status === 401 && !isAuthRoute && !isPublicGuestRoute(url)) onUnauthorized?.()
    return Promise.reject(error)
  },
)

interface ApiErrorBody {
  message?: string
  details?: Array<{ path: string; message: string }>
}

export function getErrorMessage(error: unknown, fallback = 'Something went wrong. Please try again.') {
  if (axios.isAxiosError<ApiErrorBody>(error)) {
    if (!error.response) return 'Cannot reach the server. Check your connection.'
    const status = error.response.status
    const body = error.response.data
    const firstDetail = body?.details?.[0]
    if (firstDetail && body?.message === 'Validation failed') return firstDetail.message
    if (typeof body?.message === 'string' && body.message.trim()) return body.message
    // Vite / proxies often answer 5xx with HTML or an empty body when the API is down.
    if (status === 502 || status === 503 || status === 504 || status >= 500) {
      return 'Cannot reach the server. Check your connection.'
    }
    return fallback
  }
  return error instanceof Error ? error.message : fallback
}

/** The server answered that the thing does not exist (or is not visible to this person), as opposed to a failure. */
export const isNotFoundError = (error: unknown) => axios.isAxiosError(error) && error.response?.status === 404

/** Returns field-level validation messages keyed by field path. */
export function getFieldErrors(error: unknown): Record<string, string> {
  if (!axios.isAxiosError<ApiErrorBody>(error)) return {}
  return Object.fromEntries((error.response?.data?.details ?? []).map((detail) => [detail.path, detail.message]))
}
