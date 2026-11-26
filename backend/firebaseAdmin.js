const path = require('path');
const fs = require('fs');
const admin = require('firebase-admin');
const logger = require('./observability/logger');

let firebaseAdmin = null;

function readServiceAccountFromEnv() {
  if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    return null;
  }

  try {
    return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  } catch (error) {
    throw new Error(`Invalid FIREBASE_SERVICE_ACCOUNT_JSON: ${error.message}`);
  }
}

function readServiceAccountFromPath() {
  const configuredPath = process.env.FIREBASE_PRIVATE_KEY_PATH;
  if (!configuredPath) {
    return null;
  }

  const serviceAccountPath = path.resolve(configuredPath);

  if (!fs.existsSync(serviceAccountPath)) {
    throw new Error(`FIREBASE_PRIVATE_KEY_PATH does not exist: ${serviceAccountPath}`);
  }

  return JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
}

try {
  const serviceAccount = readServiceAccountFromEnv() || readServiceAccountFromPath();

  const projectId = process.env.FIREBASE_PROJECT_ID?.trim();

  if (!serviceAccount && !projectId) {
    throw new Error(
      'Configure FIREBASE_PROJECT_ID (keyless), FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_PRIVATE_KEY_PATH.'
    );
  }

  if (!admin.apps.length) {
    // Keyless mode uses Application Default Credentials. Checking ID tokens for
    // revocation (verifyIdToken with checkRevoked) looks the user up, so those
    // credentials need permission to read Firebase Auth users.
    admin.initializeApp(
      serviceAccount
        ? { credential: admin.credential.cert(serviceAccount) }
        : { credential: admin.credential.applicationDefault(), projectId }
    );
  }

  firebaseAdmin = admin;
} catch (error) {
  logger.warn({ err: error }, 'Firebase Admin is not configured');
}

module.exports = firebaseAdmin;
