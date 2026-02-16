const jwt = require('jsonwebtoken');
const { findOrCreateUser } = require('../services/userService');

let admin = null;
try {
  admin = require('../firebaseAdmin');
} catch {
  admin = null;
}

const authenticateJWT = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) return res.status(403).json({ error: 'Token required' });

  if (admin) {
    try {
      const decodedFirebaseToken = await admin.auth().verifyIdToken(token);

      const firebaseUid = decodedFirebaseToken.uid;
      const email = decodedFirebaseToken.email;

      
      const dbUser = await findOrCreateUser(firebaseUid, email);

      req.user = {
        id: dbUser.id,
        firebaseUid: dbUser.firebase_uid,
        email: dbUser.email,
      };

      return next();
    } catch (err) {
      console.error(err);
    }
  }

  jwt.verify(token, process.env.JWT_SECRET_KEY, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });

    req.user = user;
    next();
  });
};

module.exports = authenticateJWT;
