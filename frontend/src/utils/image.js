/**
 * Converts a relative image path from the DB (e.g. "/images/Sites/fort_totten.jpg")
 * into a full URL pointing at the backend image server.
 *
 * In dev:  VITE_API_BASE is unset → falls back to window.location.origin
 *          which routes through the Vite proxy → works transparently
 * In prod: VITE_API_BASE = "https://briya-api.duckdns.org/api"
 *          IMAGE_BASE    = "https://briya-api.duckdns.org"
 */
export function getImageUrl(path) {
  if (!path) return ''
  const apiBase = import.meta.env.VITE_API_BASE || ''
  const imageBase = apiBase ? apiBase.replace(/\/api\/?$/, '') : ''
  return `${imageBase}${path}`
}
