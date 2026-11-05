import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Prevent recurrence of the production symptom: valid company UUIDs returning
// HTTP 403 because a four-group UUID regex was used in an API controller.
const controllerPaths = [
  'src/modules/tenancy/companies.controller.ts',
  'src/modules/tenancy/billing-dashboard.controller.ts',
  'src/modules/tenancy/customers.controller.ts',
  'src/modules/tenancy/products.controller.ts',
];
const validUUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const invalidUUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
test('company controllers consistently validate five-part UUIDs', () => {
  for (const path of controllerPaths) {
    const source = readFileSync(new URL('../' + path, import.meta.url), 'utf8');
    assert.ok(source.includes(validUUID), path + ' does not support valid company UUIDs');
    assert.ok(!source.includes(invalidUUID), path + ' contains the known four-group UUID bug');
  }
});
