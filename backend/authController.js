// authController.js
const admin = require('./firebaseAdmin');
const jwt = require('jsonwebtoken');

// Generate JWT token after Firebase authentication
const generateJWT = (uid, email) => {
  const payload = { userId: uid, email };  // Data to include in the JWT
  // Sign the token with your JWT secret key
  const token = jwt.sign(payload, process.env.JWT_SECRET_KEY, { expiresIn: '1h' });
  return token;
};

// Verify Firebase ID token to validate the authenticity of the user
const verifyFirebaseToken = async (firebaseToken) => {
  try {
    // Verify the Firebase token using Firebase Admin SDK
    const decodedToken = await admin.auth().verifyIdToken(firebaseToken);
    return decodedToken;  // Return decoded token (which includes user data)
  } catch (error) {
    // If the token is invalid, throw an error
    throw new Error('Invalid Firebase token');
  }
};

module.exports = {
  generateJWT,
  verifyFirebaseToken,
};
