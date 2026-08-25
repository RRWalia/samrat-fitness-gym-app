// Client-side mirror of backend/src/auth/password.js (validatePassword).
// Keep both in sync: the server remains the source of truth and still
// re-validates every password; this module only gives staff inline,
// real-time feedback before a request is sent.

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

const CHECKS = [
  {
    id: 'length',
    label: `${PASSWORD_MIN_LENGTH}+ characters`,
    test: (password) => password.length >= PASSWORD_MIN_LENGTH && password.length <= PASSWORD_MAX_LENGTH
  },
  { id: 'lowercase', label: 'Lowercase letter', test: (password) => /[a-z]/.test(password) },
  { id: 'uppercase', label: 'Uppercase letter', test: (password) => /[A-Z]/.test(password) },
  { id: 'number', label: 'Number', test: (password) => /[0-9]/.test(password) },
  { id: 'symbol', label: 'Symbol', test: (password) => /[^A-Za-z0-9]/.test(password) }
];

/** Live per-requirement state for inline checklists. */
export function passwordChecks(password) {
  const value = typeof password === 'string' ? password : '';
  return CHECKS.map(check => ({ id: check.id, label: check.label, met: check.test(value) }));
}

/**
 * Server-style policy messages (same wording and order as the backend) for
 * every requirement the password currently fails. Empty array = compliant.
 */
export function passwordPolicyErrors(password) {
  const value = typeof password === 'string' ? password : '';
  const errors = [];
  if (value.length < PASSWORD_MIN_LENGTH || value.length > PASSWORD_MAX_LENGTH) {
    errors.push(`Password must be between ${PASSWORD_MIN_LENGTH} and ${PASSWORD_MAX_LENGTH} characters.`);
  }
  if (!/[a-z]/.test(value)) errors.push('Password must include a lowercase letter.');
  if (!/[A-Z]/.test(value)) errors.push('Password must include an uppercase letter.');
  if (!/[0-9]/.test(value)) errors.push('Password must include a number.');
  if (!/[^A-Za-z0-9]/.test(value)) errors.push('Password must include a symbol.');
  return errors;
}

export function isPasswordPolicyCompliant(password) {
  return passwordPolicyErrors(password).length === 0;
}
