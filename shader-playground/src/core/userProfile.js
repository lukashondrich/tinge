/**
 * Lightweight user profile persistence helpers.
 * Their responsibility is to read/update the learner profile stored in localStorage,
 * keeping openaiRealtime.js focused on transport concerns.
 */
function buildDefaultProfile(userId) {
  const nowIso = new Date().toISOString();
  return {
    user_id: userId,
    reference_language: "",
    l1: {
      language: "",
      level: "beginner",
      mistake_patterns: [],
      mastery_status: {
        learned: [],
        struggling: [],
        forgotten: []
      },
      specific_goals: []
    },
    l2: {
      language: "",
      level: "",
      mistake_patterns: [],
      mastery_status: {
        learned: [],
        struggling: [],
        forgotten: []
      },
      specific_goals: []
    },
    l3: {
      language: "",
      level: "",
      mistake_patterns: [],
      mastery_status: {
        learned: [],
        struggling: [],
        forgotten: []
      },
      specific_goals: []
    },
    learning_style: {
      correction_style: "",
      challenge_level: "",
      session_structure: "",
      cultural_learning_interests: []
    },
    personal_context: {
      goals_and_timeline: {
        short_term: "",
        long_term: "",
        timeline: ""
      },
      immediate_needs: [],
      motivation_sources: []
    },
    communication_patterns: {
      conversation_starters: [],
      humor_style: "",
      cultural_background: "",
      professional_context: ""
    },
    practical_usage: {
      social_connections: [],
      geographic_relevance: ""
    },
    meta_learning: {
      strategy_preferences: [],
      confidence_building_needs: []
    },
    conversation_notes: "",
    last_session: nowIso,
    session_count: 0,
    created_at: nowIso
  };
}

function loadProfile(userId) {
  const storageKey = `user_profile_${userId}`;
  const storedData = localStorage.getItem(storageKey);
  if (!storedData) {
    return buildDefaultProfile(userId);
  }
  try {
    return JSON.parse(storedData);
  } catch (err) {
    console.error('Failed to parse stored user profile, resetting:', err); // eslint-disable-line no-console
    return buildDefaultProfile(userId);
  }
}

function saveProfile(profile) {
  const storageKey = `user_profile_${profile.user_id}`;
  localStorage.setItem(storageKey, JSON.stringify(profile));
}

export async function handleGetUserProfile(args) {
  try {
    const profile = loadProfile(args.user_id);
    profile.last_session = new Date().toISOString();
    profile.session_count = (profile.session_count || 0) + 1;
    saveProfile(profile);
    return profile;
  } catch (error) {
    console.error(`Error getting user profile: ${error.message}`); // eslint-disable-line no-console
    return { error: error.message };
  }
}

function addUniqueValues(existing, incoming = []) {
  const merged = new Set([...(existing || []), ...incoming]);
  return Array.from(merged);
}

export async function handleUpdateUserProfile(args) {
  try {
    const storageKey = `user_profile_${args.user_id}`;
    const storedData = localStorage.getItem(storageKey);
    const nowIso = new Date().toISOString();
    const currentProfile = storedData ? JSON.parse(storedData) : {
      user_id: args.user_id,
      language_level: "beginner",
      mistake_patterns: [],
      mastery_status: { learned: [], struggling: [], forgotten: [] },
      conversation_notes: "",
      interests: [],
      session_count: 0,
      created_at: nowIso
    };

    const updatedProfile = { ...currentProfile };

    if (args.updates.reference_language) {
      updatedProfile.reference_language = args.updates.reference_language;
    }

    if (args.updates.l1) {
      const l1 = updatedProfile.l1 || buildDefaultProfile(args.user_id).l1;
      if (args.updates.l1.language) l1.language = args.updates.l1.language;
      if (args.updates.l1.level) l1.level = args.updates.l1.level;
      if (args.updates.l1.mistake_patterns) {
        l1.mistake_patterns = addUniqueValues(l1.mistake_patterns, args.updates.l1.mistake_patterns);
      }
      if (args.updates.l1.mastery_updates) {
        const { mastery_updates } = args.updates.l1;
        const status = l1.mastery_status || { learned: [], struggling: [], forgotten: [] };
        if (mastery_updates.learned) {
          status.learned = addUniqueValues(status.learned, mastery_updates.learned);
        }
        if (mastery_updates.struggling) {
          status.struggling = addUniqueValues(status.struggling, mastery_updates.struggling);
        }
        if (mastery_updates.forgotten) {
          status.forgotten = addUniqueValues(status.forgotten, mastery_updates.forgotten);
        }
        l1.mastery_status = status;
      }
      if (args.updates.l1.specific_goals) {
        l1.specific_goals = addUniqueValues(l1.specific_goals, args.updates.l1.specific_goals);
      }
      updatedProfile.l1 = l1;
    }

    if (args.updates.l2) {
      updatedProfile.l2 = { ...(updatedProfile.l2 || {}), ...args.updates.l2 };
    }

    if (args.updates.l3) {
      updatedProfile.l3 = { ...(updatedProfile.l3 || {}), ...args.updates.l3 };
    }

    if (args.updates.learning_style) {
      updatedProfile.learning_style = {
        ...(updatedProfile.learning_style || {}),
        ...args.updates.learning_style
      };
      if (args.updates.learning_style.cultural_learning_interests) {
        updatedProfile.learning_style.cultural_learning_interests = addUniqueValues(
          updatedProfile.learning_style.cultural_learning_interests,
          args.updates.learning_style.cultural_learning_interests
        );
      }
    }

    if (args.updates.personal_context) {
      updatedProfile.personal_context = {
        ...(updatedProfile.personal_context || {}),
        ...args.updates.personal_context
      };
      if (args.updates.personal_context.goals_and_timeline) {
        updatedProfile.personal_context.goals_and_timeline = {
          ...(updatedProfile.personal_context?.goals_and_timeline || {}),
          ...args.updates.personal_context.goals_and_timeline
        };
      }
      if (args.updates.personal_context.immediate_needs) {
        updatedProfile.personal_context.immediate_needs = addUniqueValues(
          updatedProfile.personal_context.immediate_needs,
          args.updates.personal_context.immediate_needs
        );
      }
      if (args.updates.personal_context.motivation_sources) {
        updatedProfile.personal_context.motivation_sources = addUniqueValues(
          updatedProfile.personal_context.motivation_sources,
          args.updates.personal_context.motivation_sources
        );
      }
    }

    if (args.updates.communication_patterns) {
      updatedProfile.communication_patterns = {
        ...(updatedProfile.communication_patterns || {}),
        ...args.updates.communication_patterns
      };
      if (args.updates.communication_patterns.conversation_starters) {
        updatedProfile.communication_patterns.conversation_starters = addUniqueValues(
          updatedProfile.communication_patterns.conversation_starters,
          args.updates.communication_patterns.conversation_starters
        );
      }
    }

    if (args.updates.practical_usage) {
      updatedProfile.practical_usage = {
        ...(updatedProfile.practical_usage || {}),
        ...args.updates.practical_usage
      };
      if (args.updates.practical_usage.social_connections) {
        updatedProfile.practical_usage.social_connections = addUniqueValues(
          updatedProfile.practical_usage.social_connections,
          args.updates.practical_usage.social_connections
        );
      }
    }

    if (args.updates.meta_learning) {
      updatedProfile.meta_learning = {
        ...(updatedProfile.meta_learning || {}),
        ...args.updates.meta_learning
      };
      if (args.updates.meta_learning.strategy_preferences) {
        updatedProfile.meta_learning.strategy_preferences = addUniqueValues(
          updatedProfile.meta_learning.strategy_preferences,
          args.updates.meta_learning.strategy_preferences
        );
      }
      if (args.updates.meta_learning.confidence_building_needs) {
        updatedProfile.meta_learning.confidence_building_needs = addUniqueValues(
          updatedProfile.meta_learning.confidence_building_needs,
          args.updates.meta_learning.confidence_building_needs
        );
      }
    }

    if (args.updates.conversation_notes) {
      updatedProfile.conversation_notes = args.updates.conversation_notes;
    }

    updatedProfile.last_updated = nowIso;
    saveProfile(updatedProfile);

    try {
      const verification = localStorage.getItem(storageKey);
      if (!verification) {
        throw new Error('Failed to save to localStorage');
      }
      JSON.parse(verification);
    } catch (err) {
      console.error('User profile verification failed:', err); // eslint-disable-line no-console
      return { error: err.message };
    }

    return {
      success: true,
      user_id: args.user_id,
      updated_at: updatedProfile.last_updated,
      updates_applied: Object.keys(args.updates),
      profile: updatedProfile
    };
  } catch (error) {
    console.error(`Profile update error: ${error.message}`); // eslint-disable-line no-console
    return { error: error.message };
  }
}

