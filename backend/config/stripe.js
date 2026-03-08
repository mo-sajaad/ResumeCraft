let stripeClient = null;

function getStripeClient() {
  if (!process.env.STRIPE_SECRET_KEY) {
    const error = new Error('Stripe is not configured. Missing STRIPE_SECRET_KEY.');
    error.statusCode = 500;
    throw error;
  }

  let Stripe;
  try {
    Stripe = require('stripe');
  } catch (_error) {
    const dependencyError = new Error(
      "Stripe SDK is not installed. Run 'npm install stripe' in backend/."
    );
    dependencyError.statusCode = 500;
    throw dependencyError;
  }

  if (!stripeClient) {
    stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2025-02-24.acacia',
    });
  }

  return stripeClient;
}

module.exports = {
  getStripeClient,
};