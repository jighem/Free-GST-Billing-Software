import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCompanySetup } from '../dist/modules/tenancy/company-setup.js';

const baseline = {
  legalName: 'Demo Enterprise',
  tradeName: 'Demo',
  stateCode: '27',
  gstin: '27AAAAA0000A1Z5',
  billingEmail: 'ACCOUNTS@EXAMPLE.INVALID',
  billingAddress: { line1: 'Test address', city: 'Mumbai', postalCode: '400001' }
};

test('normalizes GST billing profile', () => {
  const output = validateCompanySetup(baseline);
  assert.equal(output.gstin,'27AAAAA0000A1Z5');
  assert.equal(output.stateCode,'27');
  assert.equal(output.billingEmail,'accounts@example.invalid');
  assert.equal(output.billingAddress.city,'Mumbai');
});

test('allows business without GSTIN', () => {
  const result = validateCompanySetup({legalName:'Small Business'});
  assert.equal(result.gstin,null);
  assert.equal(result.stateCode,null);
});

test('rejects GSTIN and state mismatch', () => {
  assert.throws(() => validateCompanySetup({...baseline,stateCode:'29'}));
});

test('rejects bad GSTIN and invalid state', () => {
  assert.throws(() => validateCompanySetup({...baseline,gstin:'invalid'}));
  assert.throws(() => validateCompanySetup({...baseline,stateCode:'99',gstin:''}));
});

test('rejects unsupported payload fields and malformed addresses', () => {
  assert.throws(() => validateCompanySetup({...baseline,tenantId:'other-tenant'}));
  assert.throws(() => validateCompanySetup({...baseline,billingAddress:{admin:true}}));
});
