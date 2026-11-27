// middlewares/enforceUsage.js

const { reserveUsage, releaseUsage } = require("../services/subscriptionService");
const logger = require("../observability/logger");

// Reserves one unit of the monthly limit before the handler runs and exposes
// it as req.usageReservation. The handler calls confirm() once the generated
// document is stored, or release() when generation fails. A reservation that
// is still open when an error response (status >= 400) is sent is released,
// which covers later middleware rejecting the request.
function enforceUsage(type) {
  return async (req, res, next) => {
    try {
      const userId = req.user.id;

      const { allowed, reservationId } = await reserveUsage(userId, type);

      if (!allowed) {
        return res.status(403).json({
          error: "Monthly limit reached. Upgrade your plan.",
        });
      }

      let settled = false;
      const reservation = {
        id: reservationId,
        type,
        confirm() {
          settled = true;
        },
        async release() {
          if (settled) return;
          settled = true;
          try {
            await releaseUsage(reservationId);
          } catch (err) {
            logger.error({ err, userId, type }, "Failed to release usage reservation");
          }
        },
      };

      req.usageReservation = reservation;
      res.once("finish", () => {
        if (res.statusCode >= 400) reservation.release();
      });

      next();
    } catch (err) {
      next(err);
    }
  };
}

module.exports = enforceUsage;
