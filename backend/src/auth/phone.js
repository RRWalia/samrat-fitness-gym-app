// Mobile-number helpers for staff accounts.
// Numbers are stored in normalised international form, e.g. +919825011223,
// so login lookups are exact-match regardless of how the user typed them
// (98250 11223, +91 98250-11223, 919825011223 all match).

function normalizePhone(input) {
  if (typeof input !== 'string') return null;
  const cleaned = input.replace(/[^0-9+]/g, '');
  if (!cleaned || cleaned.includes('--')) return null;
  const hasPlus = cleaned.startsWith('+');
  const digits = cleaned.replace(/\+/g, '');
  if (!/^[0-9]+$/.test(digits) || digits.length < 7 || digits.length > 15) return null;
  if (!hasPlus) {
    if (digits.length === 10) return `+91${digits}`; // Bare Indian mobile.
    if (digits.length === 12 && digits.startsWith('91')) return `+${digits}`; // 91-prefixed.
  }
  return `+${digits}`;
}

function validatePhone(input) {
  const value = typeof input === 'string' ? input.trim() : '';
  if (!value) return null; // Empty means "no phone", which is always allowed.
  if (!normalizePhone(value)) {
    return 'Mobile number must be 7–15 digits, e.g. 98250 11223 or +91 98250 11223.';
  }
  return null;
}

function maskPhone(phone) {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  const cc = phone.startsWith('+91') ? '+91' : phone.replace(/\d/g, '');
  const local = digits.slice(-4);
  return `${cc} ••••• ${local}`;
}

module.exports = { normalizePhone, validatePhone, maskPhone };
