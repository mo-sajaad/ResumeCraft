// One password rule for sign-up and Settings (IDENTITY-020).
export const MIN_PASSWORD_LENGTH = 8;

export const validateEmail = (email) => /\S+@\S+\.\S+/.test(email);
export const validatePassword = (password) => password.length >= MIN_PASSWORD_LENGTH;

// Friendly text for common Firebase auth errors. Wrong-password and unknown-user
// share one message so it does not reveal whether an account exists.
const AUTH_ERROR_MESSAGES = {
  "auth/invalid-credential": "Incorrect email or password.",
  "auth/invalid-login-credentials": "Incorrect email or password.",
  "auth/wrong-password": "Incorrect email or password.",
  "auth/user-not-found": "Incorrect email or password.",
  "auth/invalid-email": "Enter a valid email address.",
  "auth/missing-password": "Enter your password.",
  "auth/weak-password": `Use a password of at least ${MIN_PASSWORD_LENGTH} characters.`,
  "auth/email-already-in-use": "We could not create an account with that email. Try signing in instead.",
  "auth/user-disabled": "This account has been disabled.",
  "auth/too-many-requests": "Too many attempts. Wait a few minutes, then try again.",
  "auth/network-request-failed": "We could not reach the server. Check your connection and try again.",
  "auth/popup-closed-by-user": "The sign-in window was closed before finishing.",
  "auth/cancelled-popup-request": "The sign-in window was closed before finishing.",
  "auth/popup-blocked": "Your browser blocked the sign-in window. Allow pop-ups and try again.",
};

export const authErrorMessage = (err, fallback) => AUTH_ERROR_MESSAGES[err?.code] || fallback;
