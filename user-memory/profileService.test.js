const { loadUserProfile, updateUserProfile, queryUserData } = require('./profileService');

const userId = 'demo-user';

// Initial update
updateUserProfile(userId, {
  basics: { name: 'Alice', l1: 'en', l2: 'es', level: 'A2' },
  preferences: { correction: 'gentle' }
});

// Incremental update
updateUserProfile(userId, {
  learning: { mistakes: ['ser vs estar'] },
  preferences: { topics: ['travel'] }
});

const profile = loadUserProfile(userId);
console.log('profile:', profile);
console.log('topics:', queryUserData(userId, 'preferences.topics'));
