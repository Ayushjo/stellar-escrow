// Simple localStorage cache with TTL
const PREFIX = 'stellar_escrow_'
const DEFAULT_TTL = 30_000 // 30 seconds

export function cacheSet(key, value, ttl = DEFAULT_TTL) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify({ value, expires: Date.now() + ttl }))
  } catch { /* ignore quota errors */ }
}

export function cacheGet(key) {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    if (!raw) return null
    const { value, expires } = JSON.parse(raw)
    if (Date.now() > expires) { localStorage.removeItem(PREFIX + key); return null }
    return value
  } catch { return null }
}

export function cacheDelete(key) {
  try { localStorage.removeItem(PREFIX + key) } catch { /* ignore */ }
}

export function cacheClear() {
  try {
    Object.keys(localStorage)
      .filter(k => k.startsWith(PREFIX))
      .forEach(k => localStorage.removeItem(k))
  } catch { /* ignore */ }
}
