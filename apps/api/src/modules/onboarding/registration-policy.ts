// Pure validation for the planned self-service onboarding workflow.
// No public controller is attached until email delivery, abuse protection,
// verified activation and scoped DB provisioning have been implemented.
export type RegistrationDraft = {
  email: string;
  password: string;
  companyLegalName: string;
  workspaceSlug: string;
};

export function normalizeRegistration(input: unknown): RegistrationDraft {
  if (typeof input !== 'object' || input === null || Array.isArray(input))
    throw new Error('Invalid registration');
  const draft = input as Record<string, unknown>;
  if ([draft.email, draft.password, draft.companyLegalName, draft.workspaceSlug].some(x => typeof x !== 'string'))
    throw new Error('Invalid registration');

  const email = (draft.email as string).trim().toLowerCase();
  const password = draft.password as string;
  const companyLegalName = (draft.companyLegalName as string).trim();
  const workspaceSlug = (draft.workspaceSlug as string).trim().toLowerCase();

  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new Error('Invalid email');
  if (password.length < 12 || password.length > 1024)
    throw new Error('Invalid password length');
  if (companyLegalName.length < 2 || companyLegalName.length > 200)
    throw new Error('Invalid company name');
  if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(workspaceSlug))
    throw new Error('Invalid workspace slug');
  if (['admin', 'api', 'app', 'billing', 'root', 'support', 'www'].includes(workspaceSlug))
    throw new Error('Reserved workspace slug');

  return { email, password, companyLegalName, workspaceSlug };
}
