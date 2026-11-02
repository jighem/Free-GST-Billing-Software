// Run against a disposable development DB with seeded tenants and companies.
// TEST_TENANT_A / TEST_TENANT_B are UUIDs with at least one company each.
// DATABASE_URL must use restricted gst_app, never a privileged migration owner.
import assert from 'node:assert/strict';
import { Pool } from 'pg';

for (const name of ['DATABASE_URL', 'TEST_TENANT_A', 'TEST_TENANT_B']) {
  if (!process.env[name]) throw new Error(`Missing ${name}`);
}
const { TEST_TENANT_A: a, TEST_TENANT_B: b } = process.env;
if (a === b) throw new Error('Test tenants must differ');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
const scopedCount = async tenant => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (tenant) await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenant]);
    const result = await client.query('SELECT id, tenant_id FROM companies ORDER BY id');
    await client.query('COMMIT');
    return result.rows;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally { client.release(); }
};
try {
  const none = await scopedCount(null);
  assert.equal(none.length, 0, 'No tenant context must return zero companies');
  const rowsA = await scopedCount(a);
  const rowsB = await scopedCount(b);
  assert.ok(rowsA.length && rowsB.length, 'Seed companies for both tenants before running');
  assert.ok(rowsA.every(row => row.tenant_id === a), 'A must not see B');
  assert.ok(rowsB.every(row => row.tenant_id === b), 'B must not see A');
  assert.equal((await scopedCount(null)).length, 0, 'Context must reset on pooled connection reuse');
  console.log('PASS: restricted runtime role, two tenants, no context and pooled connection reuse');
} finally {
  await pool.end();
}
