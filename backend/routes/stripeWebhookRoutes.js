const express = require('express');
const pool = require('../config/db');
const { getStripeClient } = require('../config/stripe');

const router = express.Router();

function mapStripeStatusToInternalStatus(status) {
  if (status === 'active' || status === 'trialing') return 'active';
  if (status === 'canceled' || status === 'unpaid' || status === 'past_due') return 'canceled';
  return 'expired';
}

async function getPlanIdByCode(client, planCode) {
  const result = await client.query(
    'SELECT id FROM plans WHERE code = $1 AND active = TRUE LIMIT 1',
    [planCode]
  );

  return result.rows[0]?.id || null;
}

async function registerWebhookEvent(event) {
  const result = await pool.query(
    `INSERT INTO stripe_webhook_events (event_id, event_type, status)
     VALUES ($1, $2, 'processing')
     ON CONFLICT (event_id) DO NOTHING
     RETURNING event_id`,
    [event.id, event.type]
  );

  return result.rows.length > 0;
}

async function markWebhookEventProcessed(eventId) {
  await pool.query(
    `UPDATE stripe_webhook_events
     SET status = 'processed',
         processed_at = NOW(),
         error_message = NULL
     WHERE event_id = $1`,
    [eventId]
  );
}

async function markWebhookEventFailed(eventId, error) {
  await pool.query(
    `UPDATE stripe_webhook_events
     SET status = 'failed',
         processed_at = NOW(),
         error_message = $2
     WHERE event_id = $1`,
    [eventId, String(error?.message || 'unknown error').slice(0, 2000)]
  );
}

router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const signature = req.headers['stripe-signature'];

  if (!signature) {
    return res.status(400).send('Missing stripe-signature header.');
  }

  let event;

  try {
    const stripe = getStripeClient();
    event = stripe.webhooks.constructEvent(
      req.body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (error) {
    return res.status(400).send(`Webhook error: ${error.message}`);
  }

  try {
    const isFirstDelivery = await registerWebhookEvent(event);
    if (!isFirstDelivery) {
      return res.json({ received: true, duplicate: true });
    }

    const stripe = getStripeClient();

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const userId = session.metadata?.userId || session.client_reference_id;
      const planCode = session.metadata?.plan;

      if (!userId || !planCode || !['premium', 'pro'].includes(planCode)) {
        await markWebhookEventProcessed(event.id);
        return res.json({ received: true, ignored: true });
      }

      const client = await pool.connect();

      try {
        await client.query('BEGIN');

        const planId = await getPlanIdByCode(client, planCode);
        if (!planId) {
          await client.query('ROLLBACK');
          await markWebhookEventProcessed(event.id);
          return res.json({ received: true, ignored: true });
        }

        let stripeSubscriptionId = null;
        let currentPeriodEnd = null;
        let stripeCustomerId = session.customer || null;
        let stripePriceId = null;

        if (session.mode === 'subscription' && session.subscription) {
          stripeSubscriptionId = String(session.subscription);
          const subscription = await stripe.subscriptions.retrieve(stripeSubscriptionId);

          if (subscription.current_period_end) {
            currentPeriodEnd = new Date(subscription.current_period_end * 1000);
          }

          stripePriceId = subscription.items?.data?.[0]?.price?.id || null;

          if (!stripeCustomerId && subscription.customer) {
            stripeCustomerId = String(subscription.customer);
          }
        }

        await client.query(
          `
          UPDATE subscriptions
          SET status = 'canceled',
              canceled_at = NOW(),
              updated_at = NOW()
          WHERE user_id = $1
            AND status = 'active'
          `,
          [userId]
        );

        await client.query(
          `
          INSERT INTO subscriptions (
            user_id,
            plan_id,
            status,
            started_at,
            current_period_end,
            stripe_customer_id,
            stripe_subscription_id,
            stripe_price_id,
            updated_at
          ) VALUES ($1, $2, 'active', NOW(), $3, $4, $5, $6, NOW())
          ON CONFLICT (stripe_subscription_id)
          DO UPDATE SET
            user_id = EXCLUDED.user_id,
            plan_id = EXCLUDED.plan_id,
            status = EXCLUDED.status,
            current_period_end = EXCLUDED.current_period_end,
            stripe_customer_id = EXCLUDED.stripe_customer_id,
            stripe_price_id = EXCLUDED.stripe_price_id,
            updated_at = NOW()
          `,
          [
            userId,
            planId,
            currentPeriodEnd,
            stripeCustomerId,
            stripeSubscriptionId,
            stripePriceId,
          ]
        );

        await client.query('COMMIT');
      } catch (dbError) {
        await client.query('ROLLBACK');
        throw dbError;
      } finally {
        client.release();
      }
    }

    if (
      event.type === 'customer.subscription.updated' ||
      event.type === 'customer.subscription.deleted'
    ) {
      const subscription = event.data.object;
      const mappedStatus = mapStripeStatusToInternalStatus(subscription.status);
      const currentPeriodEnd = subscription.current_period_end
        ? new Date(subscription.current_period_end * 1000)
        : null;

      await pool.query(
        `
        UPDATE subscriptions
        SET status = $1,
            current_period_end = $2,
            canceled_at = CASE WHEN $1 = 'canceled' THEN NOW() ELSE canceled_at END,
            updated_at = NOW()
        WHERE stripe_subscription_id = $3
        `,
        [mappedStatus, currentPeriodEnd, subscription.id]
      );
    }

    await markWebhookEventProcessed(event.id);
    return res.json({ received: true });
  } catch (error) {
    console.error('[stripe webhook] processing failed', error);
    await markWebhookEventFailed(event.id, error).catch(() => {});
    return res.status(500).json({ message: 'Webhook processing failed.' });
  }
});

module.exports = router;
