-- Transactional registration verification outbox; Linux/staging only.
-- Store an AES-256-GCM encrypted email payload, never plaintext tokens.
BEGIN;
CREATE TABLE registration_mail_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id uuid NOT NULL REFERENCES registration_requests(id) ON DELETE CASCADE,
  recipient_email text NOT NULL,
  payload_ciphertext text NOT NULL,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  available_at timestamptz NOT NULL DEFAULT now(),
  locked_until timestamptz,
  sent_at timestamptz,
  last_error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (registration_id)
);
CREATE INDEX registration_outbox_ready_idx
 ON registration_mail_outbox(available_at) WHERE sent_at IS NULL;
REVOKE ALL ON registration_mail_outbox FROM PUBLIC;
COMMIT;
