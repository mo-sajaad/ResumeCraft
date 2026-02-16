// firebaseAdmin.js
const path = require('path');
const admin = require('firebase-admin');

let firebaseAdmin = null;

try {
  const configuredPath = process.env.FIREBASE_PRIVATE_KEY_PATH;
  const serviceAccountPath = configuredPath
    ? path.resolve(configuredPath)
    : path.join(__dirname, 'firebase-service-account.json');
  const serviceAccount = require(serviceAccountPath);

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