import { ConflictException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { createTransport } from 'nodemailer';
import { normalizeRegistration } from './registration-policy';
import { hashPassword } from '../identity/password';

// Uses a dedicated, least-privileged registration role. Neither gst_auth nor
// gst_app may insert tenants, users or tenant memberships.
@Injectable()
export class RegistrationService {
  private readonly pool: Pool;
  constructor() {
    if (!process.env.REGISTRATION_DATABASE_URL) throw Error('Missing REGISTRATION_DATABASE_URL');
    if (!process.env.REGISTRATION_HMAC_SECRET || process.env.REGISTRATION_HMAC_SECRET.length < 32)
      throw Error('Missing strong REGISTRATION_HMAC_SECRET');
    if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASSWORD ||
        !process.env.SMTP_FROM || !process.env.REGISTRATION_VERIFY_URL)
      throw Error('SMTP configuration incomplete');
    this.pool = new Pool({ connectionString: process.env.REGISTRATION_DATABASE_URL, max: 3 });
  }

  async request(input: unknown, ip: string): Promise<{ message: string }> {
    const draft = normalizeRegistration(input);
    const generic = { message: 'If the registration can be accepted, check your email for a verification code.' };
    const hmac = (value: string) => createHmac('sha256', process.env.REGISTRATION_HMAC_SECRET!).update(value).digest('hex');
    const client = await this.pool.connect();
    const token = randomBytes(32).toString('base64url');
    const hash = createHash('sha256').update(token).digest('hex');
    let inserted = false;
    try {
      await client.query('BEGIN');
      // Atomic per-hour rate limits apply to email and peer network address.
      for (const [kind, value, limit] of [['email', draft.email, 3], ['ip', ip, 10]] as const) {
        const result = await client.query<{ attempts: number }>(
          `INSERT INTO registration_rate_limits (key_hash, window_start, attempts)
           VALUES ($1, date_trunc('hour', now()), 1)
           ON CONFLICT (key_hash) DO UPDATE SET
             attempts = CASE WHEN registration_rate_limits.window_start < date_trunc('hour', now())
                              THEN 1 ELSE registration_rate_limits.attempts + 1 END,
             window_start = CASE WHEN registration_rate_limits.window_start < date_trunc('hour', now())
                                THEN date_trunc('hour', now()) ELSE registration_rate_limits.window_start END
           RETURNING attempts`, [hmac(kind + ':' + value)],
        );
        if (result.rows[0].attempts > limit) {
          await client.query('COMMIT');
          return generic;
        }
      }
      const exists = await client.query(
        'SELECT 1 FROM users WHERE email=$1 UNION SELECT 1 FROM tenants WHERE slug=$2 LIMIT 1',
        [draft.email, draft.workspaceSlug]);
      if (exists.rowCount) { await client.query('COMMIT'); return generic; }
      const passwordHash = await hashPassword(draft.password);
      await client.query(
        `INSERT INTO registration_requests (email, password_hash, company_legal_name,
         requested_slug, verification_token_hash, expires_at)
         VALUES ($1,$2,$3,$4,$5,now() + interval '30 minutes')`,
        [draft.email,passwordHash,draft.companyLegalName,draft.workspaceSlug,hash],
      );
      await client.query('COMMIT');
      inserted = true;
    } catch (e) {
      try { await client.query('ROLLBACK'); } catch { /* retain original */ }
      // Never disclose uniqueness or registration details to anonymous callers.
      throw new ServiceUnavailableException('Registration unavailable');
    } finally { client.release(); }
    if (inserted) {
      try {
        const transport = createTransport({
          host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 587),
          secure: process.env.SMTP_SECURE === '1',
          auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
          requireTLS: process.env.SMTP_SECURE !== '1',
        });
        const verifyUrl = new URL(process.env.REGISTRATION_VERIFY_URL!);
        // Fragment tokens are not transmitted in ordinary HTTP GET request paths.
        verifyUrl.hash = 'token=' + encodeURIComponent(token);
        await transport.sendMail({
          from: process.env.SMTP_FROM, to: draft.email,
          subject: 'Verify your GST SaaS registration',
          text: `Open this verification page: ${verifyUrl.toString()}\n\nThe code expires in 30 minutes. If you did not register, ignore this email.`,
        });
        await this.pool.query('UPDATE registration_requests SET dispatched_at=now() WHERE verification_token_hash=$1', [hash]);
      } catch {
        // Do not reveal SMTP configuration or user existence. Delivery retries/outbox are pending.
      }
    }
    return generic;
  }

  async verify(token: unknown): Promise<{ status: string }> {
    if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{40,128}$/.test(token))
      throw new ConflictException('Invalid or expired verification code');
    const hash = createHash('sha256').update(token).digest('hex');
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query<{
        id: string; email: string; password_hash: string;
        requested_slug: string; company_legal_name: string;
      }>(`SELECT id, email, password_hash, requested_slug, company_legal_name
          FROM registration_requests
          WHERE verification_token_hash=$1 AND consumed_at IS NULL AND expires_at>now()
          FOR UPDATE`, [hash]);
      if (!result.rows[0]) {
        await client.query('ROLLBACK');
        throw new ConflictException('Invalid or expired verification code');
      }
      const record = result.rows[0];
      const tenantId = randomUUID();
      // Transaction-local RLS context applies to every tenant-scoped write.
      await client.query("SELECT set_config('app.tenant_id',$1,true)", [tenantId]);
      await client.query('INSERT INTO tenants(id,slug,display_name) VALUES($1,$2,$3)',
        [tenantId,record.requested_slug,record.company_legal_name]);
      const user = await client.query<{ id: string }>(
        'INSERT INTO users(email,password_hash) VALUES($1,$2) RETURNING id',
        [record.email,record.password_hash]);
      await client.query(
        "INSERT INTO tenant_memberships(tenant_id,user_id,role) VALUES($1,$2,'owner')",
        [tenantId,user.rows[0].id]);
      await client.query('INSERT INTO companies(tenant_id,legal_name) VALUES($1,$2)',
        [tenantId,record.company_legal_name]);
      await client.query('UPDATE registration_requests SET consumed_at=now() WHERE id=$1',
        [record.id]);
      await client.query('COMMIT');
      return { status: 'verified' };
    } catch (e) {
      try { await client.query('ROLLBACK'); } catch { /* preserve original */ }
      if (e instanceof ConflictException) throw e;
      // Concurrent slug/email claims must not expose the conflicting account.
      throw new ConflictException('Registration cannot be completed');
    } finally { client.release(); }
  }

  async shutdown() { await this.pool.end(); }
}
