const express = require('express');
const pool = require('../config/db');
const authenticateJWT = require('../middleware/authMiddleware');
const { getStripeClient } = require('../config/stripe');

const router = express.Router();

const PLAN_PRICE_ENV_ALIASES = {
  premium: ['STRIPE_PREMIUM_PRICE_ID', 'STRIPE_PRICE_ID_PREMIUM'],
  pro: ['STRIPE_PRO_PRICE_ID', 'STRIPE_PRICE_ID_PRO'],
};

function getPlanPriceId(plan) {
  const envNames = PLAN_PRICE_ENV_ALIASES[plan] || [];
  for (const envName of envNames) {
    const value = process.env[envName];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

router.post('/checkout-session', authenticateJWT, async (req, res, next) => {
  try {
    const rawPlan = req.body?.plan;
    const plan = typeof rawPlan === 'string' ? rawPlan.trim().toLowerCase() : '';

    if (!Object.prototype.hasOwnProperty.call(PLAN_PRICE_ENV_ALIASES, plan)) {
      return res.status(400).json({ error: 'Invalid plan. Expected premium or pro.' });
    }

    const priceId = getPlanPriceId(plan);
    if (!priceId) {
      return res.status(500).json({
        error: `Stripe price is missing for plan '${plan}'. Configure one of: ${PLAN_PRICE_ENV_ALIASES[plan].join(', ')}.`,
      });
    }

    const stripe = getStripeClient();

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      customer_email: req.user.email,
      client_reference_id: String(req.user.id),
      success_url: `${process.env.APP_BASE_URL || 'http://localhost:5173'}/dashboard/payment?success=1`,
      cancel_url: `${process.env.APP_BASE_URL || 'http://localhost:5173'}/dashboard/payment?canceled=1`,
      metadata: {
        userId: String(req.user.id),
        plan,
      },
    });

    return res.json({ url: session.url });
  } catch (error) {
    return next(error);
  }
});

router.post('/portal-session', authenticateJWT, async (req, res, next) => {
  try {
    const subResult = await pool.query(
      `
      SELECT stripe_customer_id
      FROM subscriptions
      WHERE user_id = $1
        AND stripe_customer_id IS NOT NULL
      ORDER BY created_at DESC
      LIMIT 1
      `,
      [req.user.id]
    );

    const stripeCustomerId = subResult.rows[0]?.stripe_customer_id;

    if (!stripeCustomerId) {
      return res.status(400).json({
        error: 'No Stripe customer was found for this account.',
      });
    }

    const stripe = getStripeClient();

    const session = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: `${process.env.APP_BASE_URL || 'http://localhost:5173'}/dashboard/payment`,
    });

    return res.json({ url: session.url });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;