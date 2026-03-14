const workspaceRepository = require('../repositories/workspaceRepository');

async function getResumeForUser(id, userId) {
  return workspaceRepository.findResumeByIdForUser(id, userId);
}

async function getCoverLetterForUser(id, userId) {
  return workspaceRepository.findCoverLetterByIdForUser(id, userId);
}

async function updateResumeForUser(id, userId, text, generatedText) {
  return workspaceRepository.updateResumeText(id, userId, text, generatedText);
}

async function updateCoverLetterForUser(id, userId, text, generatedText) {
  return workspaceRepository.updateCoverLetterText(id, userId, text, generatedText);
}

module.exports = {
  getResumeForUser,
  getCoverLetterForUser,
  updateResumeForUser,
  updateCoverLetterForUser,
};
