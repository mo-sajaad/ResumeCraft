const express = require('express');
const jwt = require('jsonwebtoken');  // Import jsonwebtoken
const { generateJWT, verifyFirebaseToken } = require('./authController');
const dotenv = require('dotenv');
const cors = require('cors');  // To handle cross-origin requests

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5000;

// Endpoint to handle Firebase Authentication (sign in)
app.post('/auth/login', async (req, res) => {
  const { firebaseToken } = req.body;

  // Ensure Firebase token is provided
  if (!firebaseToken) {
    return res.status(400).json({ error: 'No Firebase token provided' });
  }

  try {
    // Verify the Firebase token
    const decodedToken = await verifyFirebaseToken(firebaseToken);

    // Generate a JWT token for the user
    const jwtToken = generateJWT(decodedToken.uid, decodedToken.email);

    // Send the JWT token to the client
    return res.json({ token: jwtToken });
  } catch (error) {
    return res.status(400).json({
      error: 'Firebase authentication failed',
      details: error.message,
    });
  }
});

// Middleware to protect routes by verifying the JWT
const authenticateJWT = (req, res, next) => {
  const token = req.headers['authorization']?.split(' ')[1]; // Get token from Authorization header

  // If no token is provided, return an error
  if (!token) {
    return res.status(403).json({ error: 'Authorization token is required' });
  }

  // Verify the JWT token using the secret key from environment variables
  jwt.verify(token, process.env.JWT_SECRET_KEY, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;  // Attach the decoded user info to the request object
    next();
  });
};

// Protected route example
app.get('/protected', authenticateJWT, (req, res) => {
  // Return some protected data
  res.json({ message: 'This is a protected route', user: req.user });
});

// Starting the server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
