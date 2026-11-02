import { Pool } from 'pg';
import { createTransport } from 'nodemailer';
import { decryptVerificationLink } from '../modules/onboarding/mail-crypto';

// Dedicated CLI process, NOT automatically launched by the NestJS web API.
// Use the restricted registration role; run this command from an approved Linux staging service.
const url = process.env.REGISTRATION_DATABASE_URL;
if (!url) throw new Error('Missing REGISTRATION_DATABASE_URL');
if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASSWORD || !process.env.SMTP_FROM)
  throw new Error('Missing MailEnable SMTP configuration');
const port = Number(process.env.SMTP_PORT || '587');
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid SMTP_PORT');

const pool = new Pool({ connectionString: url, max: 2 });
const transport = createTransport({
  host: process.env.SMTP_HOST,
  port,
  secure: port === 465,
  requireTLS: port !== 465,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
  tls: { rejectUnauthorized: true },
});

type Job = {
  id: string;
  recipient_email: string;
  payload_ciphertext: string;
  attempts: number;
  registration_id: string;
};

export async function dispatchOnce(): Promise<boolean> {
  // Atomic claim prevents two workers delivering the same job simultaneously.
  const selected = await pool.query<Job>(`
    WITH next AS (
      SELECT o.id FROM registration_mail_outbox o
      JOIN registration_requests r ON r.id=o.registration_id
      WHERE o.sent_at IS NULL
        AND o.available_at <= now()
        AND (o.locked_until IS NULL OR o.locked_until < now())
        AND o.attempts < 6
        AND r.consumed_at IS NULL
        AND r.expires_at > now() + interval '1 minute'
      ORDER BY o.available_at, o.created_at
      FOR UPDATE OF o SKIP LOCKED
      LIMIT 1
    )
    UPDATE registration_mail_outbox o
    SET locked_until=now()+interval '2 minutes', attempts=o.attempts+1
    FROM next WHERE o.id=next.id
    RETURNING o.id, o.recipient_email, o.payload_ciphertext, o.attempts, o.registration_id
  `);
  if (!selected.rows[0]) return false;
  const job = selected.rows[0];
  try {
    const verificationUrl = decryptVerificationLink(job.payload_ciphertext);
    await transport.sendMail({
      from: process.env.SMTP_FROM,
      to: job.recipient_email,
      subject: 'Verify your GST SaaS registration',
      text: `Verify your email using this link: ${verificationUrl}\n\nThis link expires after 30 minutes. If you did not register, ignore it.`,
      // Deterministic ID helps downstream duplicate detection if worker crashes after SMTP ACCEPT.
      messageId: `<registration-${job.id}@${process.env.SMTP_MESSAGE_ID_DOMAIN || 'gst-saas.invalid'}>`,
    });
    await pool.query(`
      UPDATE registration_mail_outbox SET sent_at=now(), locked_until=NULL, last_error_code=NULL
      WHERE id=$1`, [job.id]);
    await pool.query('UPDATE registration_requests SET dispatched_at=now() WHERE id=$1', [job.registration_id]);
  } catch (error) {
    // Never log SMTP messages, tokens, recipient emails or secret-bearing errors.
    const retryMinutes = Math.min(2 ** job.attempts, 15);
    await pool.query(`
      UPDATE registration_mail_outbox
      SET locked_until=NULL, available_at=now()+($2::integer * interval '1 minute'), last_error_code='DELIVERY_FAILED'
      WHERE id=$1`, [job.id, retryMinutes]);
    console.error('Registration mail delivery failed; queued retry');
  }
  return true;
}

async function main(): Promise<void> {
  const mode = process.argv[2];
  if (mode !== '--once') throw new Error('Use --once from a controlled Linux scheduler; no daemon process in M2');
  try {
    for (let i = 0; i < 20; i++) if (!(await dispatchOnce())) break;
  } finally {
    transport.close();
    await pool.end();
  }
}

if (require.main === module) {
  main().catch(() => { console.error('Mail worker failed'); process.exitCode = 1; });
}
