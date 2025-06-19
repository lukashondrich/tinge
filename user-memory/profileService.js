const fs = require('fs');
const path = require('path');

const PROFILE_DIR = path.join(__dirname, 'profiles');

function ensureDir() {
  if (!fs.existsSync(PROFILE_DIR)) {
    fs.mkdirSync(PROFILE_DIR, { recursive: true });
  }
}

function profilePath(userId) {
  return path.join(PROFILE_DIR, `${userId}.json`);
}

function loadUserProfile(userId) {
  ensureDir();
  const file = profilePath(userId);
  if (!fs.existsSync(file)) {
    return {};
  }
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return {};
  }
}

function mergeProfileData(existing, incoming) {
  const result = { ...existing };
  for (const [key, value] of Object.entries(incoming)) {
    if (Array.isArray(value)) {
      result[key] = Array.isArray(result[key]) ? [...new Set(result[key].concat(value))] : value;
    } else if (value && typeof value === 'object') {
      result[key] = mergeProfileData(result[key] || {}, value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

function updateUserProfile(userId, sessionData) {
  const profile = loadUserProfile(userId);
  const merged = mergeProfileData(profile, sessionData);
  ensureDir();
  fs.writeFileSync(profilePath(userId), JSON.stringify(merged, null, 2));
  return merged;
}

function queryUserData(userId, filter) {
  const profile = loadUserProfile(userId);
  if (!filter) return profile;
  const keys = filter.split('.');
  let current = profile;
  for (const key of keys) {
    if (current && key in current) {
      current = current[key];
    } else {
      return undefined;
    }
  }
  return current;
}

module.exports = {
  loadUserProfile,
  updateUserProfile,
  queryUserData,
  mergeProfileData
};
