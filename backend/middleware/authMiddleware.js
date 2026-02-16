const jwt = require('jsonwebtoken');

const authenticateJWT = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) return res.status(403).json({ error: 'Token required' });

  jwt.verify(token, process.env.JWT_SECRET_KEY, (err, user) => {
    console.log(token);
    if (err) return res.status(403).json({ error: 'Invalid token' });

    req.user = user;
    next();
  });
};

module.exports = authenticateJWT;
