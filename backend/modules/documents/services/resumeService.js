const resumeRepository = require('../repositories/resumeRepository');

async function createResume(payload) {
  return resumeRepository.insertResume(payload);
}

async function listUserResumes(userId) {
  return resumeRepository.findResumesByUser(userId);
}

async function getUserResume(id, userId) {
  return resumeRepository.findResumeByIdForUser(id, userId);
}

async function updateUserResume(id, userId, data) {
  return resumeRepository.updateResumeByIdForUser(id, userId, data);
}

async function deleteUserResume(id, userId) {
  return resumeRepository.deleteResumeByIdForUser(id, userId);
}

module.exports = {
  createResume,
  listUserResumes,
  getUserResume,
  updateUserResume,
  deleteUserResume,
};
