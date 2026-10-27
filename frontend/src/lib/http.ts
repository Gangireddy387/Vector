import axios, { AxiosError } from 'axios'

export const TOKEN_STORAGE_KEY = 'vector.token'
/** The portal's super admin signs in separately, so a super-admin tab and a normal account can be open side by side. */
export const SUPER_ADMIN_TOKEN_KEY = 'vector.superAdminToken'
/** The organization this browser is working in; sent with every request so data stays inside it. */
export const ORGANIZATION_STORAGE_KEY = 'vector.organization'

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
export const getStoredToken = () => localStorage.getItem(tokenKey)

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
  if (token) request.headers.Authorization = `Bearer ${token}`
  const organizationId = isSuperAdminTab() ? null : localStorage.getItem(ORGANIZATION_STORAGE_KEY)
  if (organizationId) request.headers['X-Organization-Id'] = organizationId
  return request
})

type UnauthorizedHandler = () => void
let onUnauthorized: UnauthorizedHandler | null = null

/** Registered by the auth store so an expired session signs the user out everywhere. */
export const setUnauthorizedHandler = (handler: UnauthorizedHandler) => {
  onUnauthorized = handler
}

http.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    const isAuthRoute = error.config?.url?.startsWith('/auth/')
    if (error.response?.status === 401 && !isAuthRoute) onUnauthorized?.()
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
    const body = error.response.data
    const firstDetail = body?.details?.[0]
    if (firstDetail && body?.message === 'Validation failed') return firstDetail.message
    return body?.message ?? fallback
  }
  return error instanceof Error ? error.message : fallback
}

/** Returns field-level validation messages keyed by field path. */
export function getFieldErrors(error: unknown): Record<string, string> {
  if (!axios.isAxiosError<ApiErrorBody>(error)) return {}
  return Object.fromEntries((error.response?.data?.details ?? []).map((detail) => [detail.path, detail.message]))
}
