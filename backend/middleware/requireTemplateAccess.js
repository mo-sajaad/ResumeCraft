const FREE_ALLOWED_TEMPLATE = 'modern';

function getRequestedStyle(req) {
  const rawStyle = req.query?.style || req.body?.style;
  if (!rawStyle || typeof rawStyle !== 'string') {
    return FREE_ALLOWED_TEMPLATE;
  }

  return rawStyle.toLowerCase();
}

function requireTemplateAccess() {
  return (req, res, next) => {
    const planCode = req.plan?.code;

    if (!planCode) {
      return res.status(403).json({ error: 'No active plan found.' });
    }

    if (planCode !== 'free') {
      return next();
    }

    const requestedStyle = getRequestedStyle(req);
    if (requestedStyle !== FREE_ALLOWED_TEMPLATE) {
      return res.status(403).json({
        error: 'Free plan includes only the Modern template. Upgrade for Corporate and Creative templates.',
      });
    }

    return next();
  };
}

module.exports = requireTemplateAccess;