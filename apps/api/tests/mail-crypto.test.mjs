import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { encryptVerificationLink, decryptVerificationLink } = require('../dist/modules/onboarding/mail-crypto.js');
test('encrypt/decrypt opaque email link; random nonce', () => {
  process.env.REGISTRATION_MAIL_KEY = 'a'.repeat(64);
  const value = 'https://staging.example.invalid/verify-email#token=secret-example';
  const a = encryptVerificationLink(value);
  const b = encryptVerificationLink(value);
  assert.notEqual(a, b);
  assert.ok(!a.includes('secret-example'));
  assert.equal(decryptVerificationLink(a), value);
  assert.equal(decryptVerificationLink(b), value);
});
test('tampered ciphertext is rejected', () => {
  process.env.REGISTRATION_MAIL_KEY = 'b'.repeat(64);
  const data = encryptVerificationLink('https://staging.example.invalid/verify-email');
  const parts = data.split('.');
  parts[1] = (parts[1].startsWith('A') ? 'B' : 'A') + parts[1].slice(1);
  assert.throws(() => decryptVerificationLink(parts.join('.')));
});
test('missing encryption key fails closed', () => {
  delete process.env.REGISTRATION_MAIL_KEY;
  assert.throws(() => encryptVerificationLink('test'));
});
