// Server-side verification of "Sign in with Google" ID tokens.
//
// The browser never sends a password: Google Identity Services hands the page a
// short-lived RS256 ID token ("credential"). This module verifies that token's
// signature against Google's published certificates and checks its audience,
// issuer and expiry before the caller is allowed to map it onto a staff account.

const { OAuth2Client } = require('google-auth-library');

const GOOGLE_ISSUERS = Object.freeze(['accounts.google.com', 'https://accounts.google.com']);
const MAX_CREDENTIAL_LENGTH = 8192; // A real ID token is ~1.5 KB.

class GoogleAuthError extends Error {
  constructor(code, message, status = 401) {
    super(message);
    this.name = 'GoogleAuthError';
    this.code = code;
    this.status = status;
  }
}

let cachedClient = null;
let cachedClientId = null;

function googleClientId() {
  return String(process.env.GOOGLE_CLIENT_ID || '').trim();
}

function isGoogleLoginConfigured() {
  return googleClientId().length > 0;
}

// The client is reused so Google's signing certificates stay cached in memory.
function getClient() {
  const clientId = googleClientId();
  if (!clientId) {
    throw new GoogleAuthError(
      'GOOGLE_NOT_CONFIGURED',
      'Google sign-in is not configured on this server. Set GOOGLE_CLIENT_ID and restart the service.',
      503
    );
  }
  if (!cachedClient || cachedClientId !== clientId) {
    cachedClient = new OAuth2Client({ clientId, issuers: GOOGLE_ISSUERS });
    cachedClientId = clientId;
  }
  return cachedClient;
}

function assertWellFormedCredential(credential) {
  if (typeof credential !== 'string' || !credential.trim()) {
    throw new GoogleAuthError('MISSING_CREDENTIAL', 'The server received an empty sign-in request without a Google token. If you are using a custom client, ensure the credential is included.', 400);
  }
  if (credential.length > MAX_CREDENTIAL_LENGTH || credential.split('.').length !== 3) {
    throw new GoogleAuthError('INVALID_CREDENTIAL', 'That Google sign-in token is malformed. Please sign in again.', 400);
  }
}

async function verifyGoogleCredential(credential) {
  assertWellFormedCredential(credential);

  let payload;
  try {
    const ticket = await getClient().verifyIdToken({
      idToken: credential,
      audience: googleClientId()
    });
    payload = ticket.getPayload();
  } catch (error) {
    throw new GoogleAuthError('INVALID_CREDENTIAL', 'Google could not verify that sign-in token. Please sign in again.');
  }

  const email = typeof payload?.email === 'string' ? payload.email.trim().toLowerCase() : '';
  if (!email) {
    throw new GoogleAuthError('NO_GOOGLE_EMAIL', 'Your Google account did not share an email address. Please choose an account with one.');
  }
  if (payload.email_verified !== true) {
    throw new GoogleAuthError('GOOGLE_EMAIL_UNVERIFIED', 'That Google email address is not verified by Google yet.');
  }

  return {
    sub: typeof payload.sub === 'string' ? payload.sub : null,
    email,
    emailVerified: true,
    fullName: typeof payload.name === 'string' ? payload.name.trim().slice(0, 100) : '',
    picture: typeof payload.picture === 'string' ? payload.picture.slice(0, 500) : null
  };
}

module.exports = {
  GoogleAuthError,
  GOOGLE_ISSUERS,
  googleClientId,
  isGoogleLoginConfigured,
  verifyGoogleCredential
};
