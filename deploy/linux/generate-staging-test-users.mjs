#!/usr/bin/env node
// Generates SQL exclusively for a dedicated, disposable staging DB.
// Passwords are written only to a root-owned, container-mounted private file.
import { randomBytes, randomUUID, scryptSync } from 'node:crypto';
import { writeFileSync } from 'node:fs';

const credentialPath = '/private/test-users.txt';
const accounts = [
  { slug: 'gst-test-a', company: 'AnytimeGST Test A', email: 'gst-test-a@example.invalid' },
  { slug: 'gst-test-b', company: 'AnytimeGST Test B', email: 'gst-test-b@example.invalid' },
];

function sqlLiteral(value) {
  if (!/^[A-Za-z0-9@._$ -]+$/.test(value)) throw new Error('Unexpected SQL fixture value');
  return "'" + value + "'";
}
const values = accounts.map(item => {
  const userId = randomUUID();
  const tenantId = randomUUID();
  const password = randomBytes(24).toString('base64url');
  const salt = randomBytes(16).toString('hex');
  const digest = scryptSync(password, salt, 64).toString('hex');
  return { ...item, userId, tenantId, password, hash: 'scrypt$' + salt + '$' + digest };
});
writeFileSync(credentialPath,
  'ANYTIMEGST DEVELOPMENT TEST ACCOUNTS — NEVER SHARE OR COMMIT\n' +
  'https://staging.anytimegst.com\n\n' +
  values.map(v => v.company + '\nEmail: ' + v.email + '\nPassword: ' + v.password + '\n').join('\n'),
  { flag: 'wx', mode: 0o600 }
);

// All interpolated values are locally generated and restricted by sqlLiteral.
const commands = ['\\set ON_ERROR_STOP on', 'BEGIN;', `DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM tenants WHERE slug IN ('gst-test-a','gst-test-b'))
     OR EXISTS (SELECT 1 FROM users WHERE email IN ('gst-test-a@example.invalid','gst-test-b@example.invalid'))
  THEN RAISE EXCEPTION 'Staging test accounts already exist; no changes performed'; END IF;
END $$;`];
for (const v of values) {
  commands.push(`INSERT INTO tenants (id, slug, display_name) VALUES
  (${sqlLiteral(v.tenantId)}, ${sqlLiteral(v.slug)}, ${sqlLiteral(v.company)});`);
  commands.push(`INSERT INTO users (id, email, password_hash) VALUES
  (${sqlLiteral(v.userId)}, ${sqlLiteral(v.email)}, ${sqlLiteral(v.hash)});`);
  commands.push(`INSERT INTO tenant_memberships (tenant_id, user_id, role) VALUES
  (${sqlLiteral(v.tenantId)}, ${sqlLiteral(v.userId)}, 'owner');`);
  commands.push(`INSERT INTO companies (tenant_id, legal_name) VALUES
  (${sqlLiteral(v.tenantId)}, ${sqlLiteral(v.company)});`);
}
commands.push('COMMIT;');
process.stdout.write(commands.join('\n') + '\n');
