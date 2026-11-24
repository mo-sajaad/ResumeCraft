const mockPoolQuery = jest.fn();

jest.mock('../config/db', () => ({
  query: (...args) => mockPoolQuery(...args),
  connect: jest.fn(),
}));

const mockConstructEvent = jest.fn();

jest.mock('../config/stripe', () => ({
  getStripeClient: () => ({
    webhooks: { constructEvent: (...args) => mockConstructEvent(...args) },
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
  // Also drops unused mockResolvedValueOnce values, which clearing keeps.
  beforeEach(() => {
    jest.resetAllMocks();
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_synthetic';
  });

  afterAll(() => {
    delete process.env.STRIPE_WEBHOOK_SECRET;
  });

  it('returns duplicate=true for replayed deliveries', async () => {
    mockConstructEvent.mockReturnValue({ id: 'evt_dup', type: 'checkout.session.completed', data: { object: {} } });
    mockPoolQuery.mockResolvedValueOnce({ rows: [] });

    const handler = getWebhookHandler();
    const req = { headers: { 'stripe-signature': 'sig' }, body: Buffer.from('{}') };
    const res = createRes();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ received: true, duplicate: true });
    expect(mockConstructEvent).toHaveBeenCalledWith(req.body, 'sig', 'whsec_synthetic');
    expect(mockPoolQuery).toHaveBeenCalledTimes(1);
  });

  it('current behavior (known bug BILLING-011): maps past_due to canceled for subscription updates', async () => {
    mockConstructEvent.mockReturnValue({
      id: 'evt_sub_update',
      type: 'customer.subscription.updated',
      data: { object: { id: 'sub_1', status: 'past_due', current_period_end: 1730000000 } },
    });

    mockPoolQuery
      .mockResolvedValueOnce({ rows: [{ event_id: 'evt_sub_update' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const handler = getWebhookHandler();
    const req = { headers: { 'stripe-signature': 'sig' }, body: Buffer.from('{}') };
    const res = createRes();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    const statusUpdateCall = mockPoolQuery.mock.calls.find(([sql]) => String(sql).includes('UPDATE subscriptions'));
    expect(statusUpdateCall[1][0]).toBe('canceled');
    expect(statusUpdateCall[1][2]).toBe('sub_1');
  });
});
