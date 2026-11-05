// A tab-scoped staging login: survives refresh and Shift+F5, never localStorage.
// The API remains authoritative (user_sessions in PostgreSQL, 12-hour expiry).
// Production should migrate bearer tokens to Secure/HttpOnly cookie sessions.
const KEY = 'anytime-gst-staging-session-v1';
const TOKEN = /^[A-Za-z0-9_-]{40,128}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function clearSession() {
  try { sessionStorage.removeItem(KEY); } catch { /* unavailable/private mode */ }
}

export function loadSession() {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const value = JSON.parse(raw);
    if (!TOKEN.test(value?.token || '') || !Number.isFinite(value?.expiresAt) ||
        value.expiresAt <= Date.now() || value.expiresAt > Date.now() + 12 * 60 * 60 * 1000) {
      clearSession();
      return null;
    }
    return {
      token: value.token,
      expiresAt: value.expiresAt,
      tenantId: UUID.test(value.tenantId || '') ? value.tenantId : null
    };
  } catch {
    clearSession();
    return null;
  }
}

export function saveSession(token, expiresIn, tenantId = null) {
  if (!TOKEN.test(token) || !Number.isFinite(expiresIn) || expiresIn <= 0 ||
      expiresIn > 12 * 60 * 60) return false;
  const value = {
    token,
    expiresAt: Date.now() + expiresIn * 1000,
    tenantId: UUID.test(tenantId || '') ? tenantId : null
  };
  try {
    sessionStorage.setItem(KEY, JSON.stringify(value));
    return true;
  } catch {
    return false; // Login still works in-memory if browser storage is blocked.
  }
}

export function rememberTenant(tenantId) {
  const session = loadSession();
  if (!session || !UUID.test(tenantId || '')) return false;
  try {
    sessionStorage.setItem(KEY, JSON.stringify({...session, tenantId}));
    return true;
  } catch { return false; }
}
