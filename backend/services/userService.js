const userRepository = require('../modules/identity/repositories/userRepository'); 

// True only when the email is the problem; other 23505s are real failures.
function isEmailConflict(error) {
  return error.code === '23505' && error.constraint === 'users_email_key';
}

function emailInUseError() {
  return Object.assign(new Error('Email belongs to another user.'), { code: 'EMAIL_IN_USE' });
}

// A failed ROLLBACK must not replace the error that caused it (IDENTITY-023).
async function rollbackQuietly(client) {
  try {
    await client.query('ROLLBACK');
  } catch {
    // The connection is released below; the original error is rethrown.
  }
}

async function saveUser({ firebaseUid, email, fullName, moveEmailHolder = false }) {
  const pool = userRepository.getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    if (moveEmailHolder && !(await userRepository.moveEmailHolderToUid(client, { firebaseUid, email }))) {
      throw emailInUseError();
    }

    const user = await userRepository.insertOrUpdateUser(client, { firebaseUid, email, fullName });
    if (!user) {
      // The upsert skips a soft-deleted row rather than reviving it (IDENTITY-019).
      throw Object.assign(new Error('Account has been deleted.'), { code: 'ACCOUNT_DELETED' });
    }
    const freePlanId = await userRepository.getFreePlanId(client);

    if (!freePlanId) {
      throw new Error('Free subscription plan is not configured.');
    }

    await userRepository.ensureDefaultSubscription(client, user.id, freePlanId);

    await client.query('COMMIT');

    return user;
  } catch (error) {
    await rollbackQuietly(client);
    throw error;
  } finally {
    client.release();
  }
}

// Rejects with code EMAIL_IN_USE when another UID holds the email.
async function findOrCreateUser(firebaseUid, email, fullName = null) {
  const details = { firebaseUid, email, fullName };

  try {
    return await saveUser(details);
  } catch (error) {
    if (!isEmailConflict(error)) throw error;
  }

  // Concurrent first exchanges of one UID can also collide on the email index.
  // The other transaction has committed by now, so only a real conflict repeats.
  try {
    return await saveUser(details);
  } catch (error) {
    throw isEmailConflict(error) ? emailInUseError() : error;
  }
}

// Only for an email that Firebase reports as verified for this UID.
async function linkUserToVerifiedEmail(firebaseUid, email, fullName = null) {
  try {
    return await saveUser({ firebaseUid, email, fullName, moveEmailHolder: true });
  } catch (error) {
    throw isEmailConflict(error) ? emailInUseError() : error;
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

    const preferences = await userRepository.upsertPreferences(client, {
      userId,
      weeklyInsights: typeof weeklyInsights === 'boolean' ? weeklyInsights : null,
      jobAlerts: typeof jobAlerts === 'boolean' ? jobAlerts : null,
    });

    await client.query('COMMIT');
    return preferences;
  } catch (error) {
    await rollbackQuietly(client);
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  findOrCreateUser,
  linkUserToVerifiedEmail,
  getUserByFirebaseUid,
  incrementTokenVersion,
  getUserProfileByFirebaseUid,
  updateUserPreferences,
};
