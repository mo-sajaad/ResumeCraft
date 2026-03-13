const path = require('path');
const fs = require('fs');
const admin = require('firebase-admin');

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

  if (!serviceAccount) {
    throw new Error(
      'Missing Firebase Admin credentials. Configure FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_PRIVATE_KEY_PATH.'
    );
  }

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  }

  firebaseAdmin = admin;
} catch (error) {
  console.warn('[firebaseAdmin] Firebase Admin is not configured:', error.message);
}

module.exports = firebaseAdmin;
