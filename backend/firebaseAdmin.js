const path = require('path');
const fs = require('fs');
const admin = require('firebase-admin');
const logger = require('./observability/logger');

// Credential variables from before keyless mode. FIREBASE_PROJECT_ID wins over
// them, and in production they must be removed (IDENTITY-016).
const KEY_VARIABLES = ['FIREBASE_SERVICE_ACCOUNT_JSON', 'FIREBASE_PRIVATE_KEY_PATH'];

let firebaseAdmin = null;

// Error messages name variables only: parser messages can quote credential text.
function readServiceAccountFromEnv() {
  if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    return null;
  }

  try {
    return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  } catch {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON.');
  }
}

function readServiceAccountFromPath() {
  const configuredPath = process.env.FIREBASE_PRIVATE_KEY_PATH;
  if (!configuredPath) {
    return null;
  }

  const serviceAccountPath = path.resolve(configuredPath);

  if (!fs.existsSync(serviceAccountPath)) {
    throw new Error('The file named by FIREBASE_PRIVATE_KEY_PATH does not exist.');
  }

  try {
    return JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
  } catch {
    throw new Error('The file named by FIREBASE_PRIVATE_KEY_PATH is not readable JSON.');
  }
}

function initialise() {
  const isProduction = process.env.NODE_ENV === 'production';
  const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
  const keyVariables = KEY_VARIABLES.filter((name) => process.env[name]?.trim());

  if (projectId && keyVariables.length) {
    const ignored = keyVariables.join(' and ');
    if (isProduction) {
      throw new Error(
        `FIREBASE_PROJECT_ID is set, so remove ${ignored}. Refusing to start with both when NODE_ENV=production.`
      );
    }
    logger.warn({ ignoredVariables: keyVariables }, `FIREBASE_PROJECT_ID is set; ignoring ${ignored}`);
  }

  const serviceAccount = projectId ? null : readServiceAccountFromEnv() || readServiceAccountFromPath();

  if (!serviceAccount && !projectId) {
    throw new Error(
      'Configure FIREBASE_PROJECT_ID (keyless), FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_PRIVATE_KEY_PATH.'
    );
  }

  if (!admin.apps.length) {
    let credential;
    try {
      credential = serviceAccount
        ? admin.credential.cert(serviceAccount)
        : admin.credential.applicationDefault();
    } catch {
      throw new Error(
        serviceAccount ? 'The configured service account is not a usable credential.' : 'Keyless credentials failed to load.'
      );
    }
    // Keyless mode uses Application Default Credentials. Checking ID tokens for
    // revocation (verifyIdToken with checkRevoked) looks the user up, so those
    // credentials need permission to read Firebase Auth users.
    admin.initializeApp(serviceAccount ? { credential } : { credential, projectId });
  }

  return admin;
}

try {
  firebaseAdmin = initialise();
} catch (error) {
  // Fail closed: production must not start an API that cannot sign anyone in.
  if (process.env.NODE_ENV === 'production') {
    throw new Error(`Firebase Admin is not configured: ${error.message}`);
  }
  logger.warn({ reason: error.message }, 'Firebase Admin is not configured');
}

module.exports = firebaseAdmin;
