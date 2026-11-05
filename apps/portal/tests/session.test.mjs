import test from 'node:test';
import assert from 'node:assert/strict';
import { clearSession, loadSession, rememberTenant, saveSession } from '../src/session.js';

function storage() {
  const items = new Map();
  return {
    getItem: key => items.get(key) ?? null,
    setItem: (key, value) => items.set(key, value),
    removeItem: key => items.delete(key)
  };
}

const token = 'A'.repeat(43);
const tenant = '11111111-1111-4111-8111-111111111111';

test('tab session survives module reload and retains selected company workspace', () => {
  globalThis.sessionStorage = storage();
  assert.equal(saveSession(token, 43200), true);
  assert.equal(rememberTenant(tenant), true);
  const recovered = loadSession();
  assert.equal(recovered.token, token);
  assert.equal(recovered.tenantId, tenant);
  assert.ok(recovered.expiresAt > Date.now());
});

test('clears expired session and malformed tokens', () => {
  globalThis.sessionStorage = storage();
  const key = 'anytime-gst-staging-session-v1';
  sessionStorage.setItem(key, JSON.stringify({ token, expiresAt: Date.now() - 1, tenantId: tenant }));
  assert.equal(loadSession(), null);
  assert.equal(sessionStorage.getItem(key), null);
  assert.equal(saveSession('invalid', 43200), false);
  assert.equal(loadSession(), null);
});

test('explicit logout clears session and avoids reuse after reload', () => {
  globalThis.sessionStorage = storage();
  saveSession(token, 300, tenant);
  clearSession();
  assert.equal(loadSession(), null);
});

test('fails safely when storage is blocked by browser settings', () => {
  globalThis.sessionStorage = {
    getItem() { throw Error('not permitted'); },
    setItem() { throw Error('not permitted'); },
    removeItem() { throw Error('not permitted'); }
  };
  assert.equal(loadSession(), null);
  assert.equal(saveSession(token, 300), false);
  assert.equal(rememberTenant(tenant), false);
  assert.doesNotThrow(clearSession);
});
