const PREFIX = '/api/v1';
export class ApiError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}
export async function api(path, { method = 'GET', body, token, signal } = {}) {
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('..'))
    throw new ApiError('Invalid API request', 0);
  let response;
  try {
    response = await fetch(PREFIX + path, {
      method,
      headers: {
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
      cache: 'no-store',
      credentials: 'omit',
    });
  } catch {
    throw new ApiError('API connection unavailable. Contact the staging administrator.', 0);
  }
  let result;
  try { result = await response.json(); }
  catch { throw new ApiError('The API returned an unexpected response.', response.status); }
  if (!response.ok) {
    // Avoid displaying backend stack traces or untrusted response HTML.
    const safe = response.status === 401 ? 'Invalid credentials or session expired.'
      : response.status === 403 ? 'You do not have access to this workspace.'
      : response.status === 404 ? 'This feature is not available on the staging API.'
      : response.status === 409 ? 'Verification token is invalid, expired or already used.'
      : response.status === 400 ? 'Please check the submitted details.'
      : 'The request could not be completed.';
    throw new ApiError(safe, response.status);
  }
  return result;
}
