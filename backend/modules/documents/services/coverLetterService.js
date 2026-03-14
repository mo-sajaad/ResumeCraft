const coverLetterRepository = require('../repositories/coverLetterRepository');

async function createCoverLetter(payload) {
  return coverLetterRepository.insertCoverLetter(payload);
}

async function listUserCoverLetters(userId) {
  return coverLetterRepository.findCoverLettersByUser(userId);
}

async function getUserCoverLetter(id, userId) {
  return coverLetterRepository.findCoverLetterByIdForUser(id, userId);
}

async function updateUserCoverLetter(id, userId, data) {
  return coverLetterRepository.updateCoverLetterByIdForUser(id, userId, data);
}

async function deleteUserCoverLetter(id, userId) {
  return coverLetterRepository.deleteCoverLetterByIdForUser(id, userId);
}

module.exports = {
  createCoverLetter,
  listUserCoverLetters,
  getUserCoverLetter,
  updateUserCoverLetter,
  deleteUserCoverLetter,
};
