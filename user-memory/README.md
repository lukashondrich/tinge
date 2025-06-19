# User Memory System

This module provides basic user profile storage for the tutoring app. Profiles are stored as JSON files in `user-memory/profiles/` and can be loaded, queried, and updated at runtime.

## API

```javascript
const {
  loadUserProfile,
  updateUserProfile,
  queryUserData,
  mergeProfileData
} = require('./profileService');
```

- `loadUserProfile(userId)` – returns the user's profile object or an empty one if none exists.
- `updateUserProfile(userId, sessionData)` – merges `sessionData` into the existing profile and saves it.
- `queryUserData(userId, filter)` – retrieves nested data using dot notation (e.g., `"preferences.topics"`). If no filter is given, returns the entire profile.
- `mergeProfileData(existing, incoming)` – utility for deep merging profiles.

Profiles are saved immediately when updated. The storage directory is created on first use.
