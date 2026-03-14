const { isAdminUid } = require('../services/adminService');

function requireAdmin(req, res, next) {
  if (!isAdminUid(req.user?.firebaseUid)) {
    return res.status(403).json({ error: 'Admin access required.' });
  }

  return next();
}

module.exports = requireAdmin;
