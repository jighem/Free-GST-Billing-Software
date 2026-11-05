import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { normalizeRegistration } = require('../dist/modules/onboarding/registration-policy.js');

const valid = {
  email: '  HELLO@EXAMPLE.COM ',
  password: 'not-a-real-password',
  companyLegalName: '  Sample Trading LLP  ',
  workspaceSlug: ' Sample-Workspace ',
};

test('normalizes safe registration fields', () => {
  assert.deepEqual(normalizeRegistration(valid), {
    email: 'hello@example.com',
    password: valid.password,
    companyLegalName: 'Sample Trading LLP',
    workspaceSlug: 'sample-workspace',
  });
});
test('rejects reserved workspace names', () => {
  assert.throws(() => normalizeRegistration({ ...valid, workspaceSlug: 'ADMIN' }));
});
test('rejects weak/short passwords', () => {
  assert.throws(() => normalizeRegistration({ ...valid, password: 'short' }));
});
test('rejects invalid email and missing fields', () => {
  assert.throws(() => normalizeRegistration({ ...valid, email: 'invalid' }));
  assert.throws(() => normalizeRegistration({ email: 'x@example.com' }));
  assert.throws(() => normalizeRegistration(null));
});
test('rejects extra-long company and illegal slug characters', () => {
  assert.throws(() => normalizeRegistration({ ...valid, companyLegalName: 'a'.repeat(201) }));
  assert.throws(() => normalizeRegistration({ ...valid, workspaceSlug: '../../admin' }));
});
