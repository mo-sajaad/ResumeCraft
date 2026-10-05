const userRepository = require('../modules/identity/repositories/userRepository'); 

async function findOrCreateUser(firebaseUid, email, fullName = null) {
  const pool = userRepository.getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const user = await userRepository.insertOrUpdateUser(client, { firebaseUid, email, fullName });
    const freePlanId = await userRepository.getFreePlanId(client);

    if (!freePlanId) {
      throw new Error('Free subscription plan is not configured.');
    }

    await userRepository.ensureDefaultSubscription(client, user.id, freePlanId);

    await client.query('COMMIT');

    return user;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function getUserByFirebaseUid(firebaseUid) {
  return userRepository.findByFirebaseUid(firebaseUid);
}

async function incrementTokenVersion(firebaseUid) {
  return userRepository.incrementTokenVersion(firebaseUid);
}

async function getUserProfileByFirebaseUid(firebaseUid) {
  return userRepository.getProfileByFirebaseUid(firebaseUid);
}

async function updateUserPreferences(firebaseUid, { weeklyInsights, jobAlerts }) {
  const pool = userRepository.getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const userId = await userRepository.getUserIdByFirebaseUid(client, firebaseUid);

    if (!userId) {
      const error = new Error('User not found.');
      error.statusCode = 404;
      throw error;
    }

    const currentPreferences = await userRepository.getPreferencesByUserId(client, userId) || {
      weekly_insights: false,
      job_alerts: false,
    };

    const nextWeeklyInsights =
      typeof weeklyInsights === 'boolean' ? weeklyInsights : currentPreferences.weekly_insights;
    const nextJobAlerts = typeof jobAlerts === 'boolean' ? jobAlerts : currentPreferences.job_alerts;

    const preferences = await userRepository.upsertPreferences(client, {
      userId,
      weeklyInsights: nextWeeklyInsights,
      jobAlerts: nextJobAlerts,
    });

    await client.query('COMMIT');
    return preferences;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  findOrCreateUser,
  getUserByFirebaseUid,
  incrementTokenVersion,
  getUserProfileByFirebaseUid,
  updateUserPreferences,
};
