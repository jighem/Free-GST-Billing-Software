import test from 'node:test';
import assert from 'node:assert/strict';
import { api, ApiError } from '../src/api.js';

test('rejects unsafe endpoint paths without sending a network request', async () => {
  globalThis.fetch = () => { throw new Error('fetch must not be called'); };
  await assert.rejects(api('//outside'), ApiError);
  await assert.rejects(api('/../admin'), ApiError);
});

test('sends relative same-origin API calls without browser credentials', async () => {
  globalThis.fetch = async (url, options) => {
    assert.equal(url, '/api/v1/auth/tenants');
    assert.equal(options.credentials, 'omit');
    assert.equal(options.cache, 'no-store');
    assert.equal(options.headers.Authorization, 'Bearer sample-token');
    return { ok: true, json: async () => [{ tenant_id: 't1' }] };
  };
  assert.deepEqual(await api('/auth/tenants', { token: 'sample-token' }), [{ tenant_id: 't1' }]);
});

test('converts 404 to safe unavailable-feature message', async () => {
  globalThis.fetch = async () => ({ ok: false, status: 404, json: async () => ({ message: '<script>secret</script>' }) });
  await assert.rejects(api('/registrations'), err => err.status === 404 && !err.message.includes('secret'));
});

test('blocks unusable HTML responses from masquerading as JSON', async () => {
  globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => { throw new Error('HTML'); } });
  await assert.rejects(api('/auth/login'), err => err.message.includes('unexpected response'));
});

test('network failure returns a safe connection message', async () => {
  globalThis.fetch = async () => { throw new Error('internal network hostname is private'); };
  await assert.rejects(api('/auth/tenants'), err =>
    err.status === 0 && err.message.includes('connection unavailable') &&
    !err.message.includes('internal network hostname'));
});
