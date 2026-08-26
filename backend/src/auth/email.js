// Staff identity helpers. A staff account is now identified by the Google
// (Gmail) address an administrator registered for it — there are no passwords.

const EMAIL_PATTERN = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/;
const MAX_EMAIL_LENGTH = 254; // RFC 5321 path limit.

function normalizeEmail(input) {
  if (typeof input !== 'string') return null;
  const value = input.trim().toLowerCase();
  if (!value || value.length > MAX_EMAIL_LENGTH) return null;
  return EMAIL_PATTERN.test(value) ? value : null;
}

function validateEmail(input) {
  const value = typeof input === 'string' ? input.trim() : '';
  if (!value) return 'A Google account email (Gmail address) is required.';
  if (!normalizeEmail(value)) {
    return 'Enter a valid email address, e.g. name@gmail.com.';
  }
  return null;
}

function maskEmail(email) {
  if (!email) return null;
  const [local = '', domain = ''] = email.split('@');
  const visible = local.slice(0, 2);
  return `${visible}${'•'.repeat(Math.max(local.length - 2, 1))}@${domain}`;
}

module.exports = { normalizeEmail, validateEmail, maskEmail, MAX_EMAIL_LENGTH };
