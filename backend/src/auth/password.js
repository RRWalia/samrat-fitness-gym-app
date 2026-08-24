const USERNAME_PATTERN = /^[a-zA-Z0-9._-]{3,40}$/;

function validateUsername(username) {
  if (typeof username !== 'string' || !USERNAME_PATTERN.test(username.trim())) {
    return 'Username must be 3–40 characters and use only letters, numbers, dots, underscores, or hyphens.';
  }
  return null;
}

function validatePassword(password) {
  if (typeof password !== 'string' || password.length < 12 || password.length > 128) {
    return 'Password must be between 12 and 128 characters.';
  }
  if (!/[a-z]/.test(password)) return 'Password must include a lowercase letter.';
  if (!/[A-Z]/.test(password)) return 'Password must include an uppercase letter.';
  if (!/[0-9]/.test(password)) return 'Password must include a number.';
  if (!/[^A-Za-z0-9]/.test(password)) return 'Password must include a symbol.';
  return null;
}

function bcryptRounds() {
  const configured = Number(process.env.BCRYPT_ROUNDS || 12);
  if (!Number.isInteger(configured)) return 12;
  return Math.min(14, Math.max(10, configured));
}

module.exports = { validateUsername, validatePassword, bcryptRounds };
