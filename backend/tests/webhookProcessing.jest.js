const poolQuery = jest.fn();

jest.mock('../config/db', () => ({
  query: (...args) => poolQuery(...args),
  connect: jest.fn(),
}));

const constructEventMock = jest.fn();

jest.mock('../config/stripe', () => ({
  getStripeClient: () => ({
    webhooks: { constructEvent: constructEventMock },
    subscriptions: { retrieve: jest.fn() },
  }),
}));

const router = require('../modules/billing/routes/stripeWebhookRoutes');

function getWebhookHandler() {
  const layer = router.stack.find((entry) => entry.route?.path === '/webhook');
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

function createRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    send(payload) {
      this.body = payload;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

describe('stripe webhook processing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns duplicate=true for replayed deliveries', async () => {
    constructEventMock.mockReturnValue({ id: 'evt_dup', type: 'checkout.session.completed', data: { object: {} } });
    poolQuery.mockResolvedValueOnce({ rows: [] });

    const handler = getWebhookHandler();
    const req = { headers: { 'stripe-signature': 'sig' }, body: Buffer.from('{}') };
    const res = createRes();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ received: true, duplicate: true });
  });

  it('maps past_due to canceled for subscription updates', async () => {
    constructEventMock.mockReturnValue({
      id: 'evt_sub_update',
      type: 'customer.subscription.updated',
      data: { object: { id: 'sub_1', status: 'past_due', current_period_end: 1730000000 } },
    });

    poolQuery
      .mockResolvedValueOnce({ rows: [{ event_id: 'evt_sub_update' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const handler = getWebhookHandler();
    const req = { headers: { 'stripe-signature': 'sig' }, body: Buffer.from('{}') };
    const res = createRes();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    const statusUpdateCall = poolQuery.mock.calls.find(([sql]) => String(sql).includes('UPDATE subscriptions'));
    expect(statusUpdateCall[1][0]).toBe('canceled');
  });
});
