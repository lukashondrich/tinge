// openaiRealtime.js - DEBUG VERSION
// This module handles WebRTC connections to OpenAI's Realtime API


import { AudioManager } from './audio/audioManager';
import { StorageService } from './core/storageService';
import jsyaml from 'js-yaml';


let peerConnection = null;
let dataChannel = null;
let audioTrack = null;
let isMicActive = false;
let isConnected = false;
let pttButton = null;
let onRemoteStreamCallback = null;
let onEventCallback = null;
let aiRecordingStartTime = null;
let aiWordOffsets = [];
let pendingUserRecordPromise = null;
let pendingUserRecord = null;

// Toggle to switch between semantic VAD and manual push‑to‑talk control.
// When false, turn detection will be disabled and the client must
// explicitly commit audio turns via the PTT button.
const ENABLE_SEMANTIC_VAD = false;


// Send a Blob to /transcribe and return Whisper’s word timestamps
async function fetchWordTimings(blob) {
    const fd = new FormData();
    fd.append('file', blob, 'utterance.webm');
    const res = await fetch('/transcribe', { method: 'POST', body: fd });
    if (!res.ok) throw new Error(`Transcription API error ${res.status}`);
    const { words, fullText } = await res.json();
    return { words, fullText };
  }

// Stop recording, fetch timestamps, attach to record, then return it
function stopAndTranscribe(audioMgr, transcriptText) {
    return audioMgr.stopRecording(transcriptText)
      .then(async record => {
        if (!record) return null;
        try {
          debugLog(`🔍 Fetching word timings for transcript: "${transcriptText.substring(0, 50)}..."`);
          const { words, fullText } = await fetchWordTimings(record.audioBlob);
          record.wordTimings = words;
          record.fullText    = fullText;
          debugLog(`✅ Word timings fetched: ${words ? words.length : 0} words`);
        } catch (err) {
          debugLog(`⚠️ Word timing fetch failed: ${err.message}`, true);
          record.wordTimings = [];
          record.fullText    = record.text; // fallback to original
        }
        return record;
      });
  }

// Debug logging function
function debugLog(message, error = false) {
  const prefix = error ? '❌ ERROR:' : '🔍 DEBUG:';
  console.log(`${prefix} ${message}`);
}

// our recorder for “utterance” blobs
const userAudioMgr = new AudioManager({ speaker: 'user' });
const aiAudioMgr = new AudioManager({ speaker: 'ai' });

// Helper function to inspect localStorage profile (for debugging)
window.inspectUserProfile = function(userId = 'student_001') {
  const storageKey = `user_profile_${userId}`;
  const data = localStorage.getItem(storageKey);
  if (data) {
    const profile = JSON.parse(data);
    console.log('📊 Complete User Profile:', profile);
    
    // Display summary table
    console.table({
      'User ID': profile.user_id,
      'Reference Language': profile.reference_language || 'Not set',
      'L1 Language': profile.l1?.language || 'Not set',
      'L1 Level': profile.l1?.level || 'Not set',
      'Session Count': profile.session_count,
      'Last Updated': profile.last_updated,
      'Correction Style': profile.learning_style?.correction_style || 'Not set',
      'Challenge Level': profile.learning_style?.challenge_level || 'Not set'
    });
    
    // Display detailed sections
    if (profile.l1?.mistake_patterns?.length > 0) {
      console.log('🚨 L1 Mistake Patterns:', profile.l1.mistake_patterns);
    }
    if (profile.l1?.mastery_status?.learned?.length > 0) {
      console.log('✅ L1 Learned:', profile.l1.mastery_status.learned);
    }
    if (profile.learning_style?.cultural_learning_interests?.length > 0) {
      console.log('🎨 Cultural Interests:', profile.learning_style.cultural_learning_interests);
    }
    if (profile.personal_context?.immediate_needs?.length > 0) {
      console.log('🎯 Immediate Needs:', profile.personal_context.immediate_needs);
    }
    if (profile.communication_patterns?.conversation_starters?.length > 0) {
      console.log('💬 Conversation Starters:', profile.communication_patterns.conversation_starters);
    }
    if (profile.conversation_notes) {
      console.log('📝 Session Notes:', profile.conversation_notes);
    }
    
    return profile;
  } else {
    console.log('❌ No profile found in localStorage');
    return null;
  }
};

// Helper function to clear profile (for testing)
window.clearUserProfile = function(userId = 'student_001') {
  const storageKey = `user_profile_${userId}`;
  localStorage.removeItem(storageKey);
  console.log('🗑️ Profile cleared from localStorage');
};

// Function handlers for memory management
async function handleGetUserProfile(args) {
  try {
    debugLog(`🔍 Getting user profile for user: ${args.user_id}`);
    
    // Get profile from localStorage
    const storageKey = `user_profile_${args.user_id}`;
    const storedData = localStorage.getItem(storageKey);
    
    let profile;
    if (storedData) {
      profile = JSON.parse(storedData);
      debugLog(`📋 Found existing profile in localStorage`);
    } else {
      debugLog(`📝 No profile found for ${args.user_id}, creating new one`);
      profile = {
        user_id: args.user_id,
        
        // Language Background
        reference_language: "",  // Native/strong language for reference
        
        // L1 - Primary Target Language
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
        
        // L2 - Secondary Target Language (optional)
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
        
        // L3 - Tertiary Target Language (optional)
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
        
        // Learning Style Preferences
        learning_style: {
          correction_style: "", // gentle, direct, delayed, etc.
          challenge_level: "", // comfortable, moderate, challenging
          session_structure: "", // structured, flexible, conversation-focused
          cultural_learning_interests: [] // topics they want to explore
        },
        
        // Personal Context & Motivation
        personal_context: {
          goals_and_timeline: {
            short_term: "",
            long_term: "",
            timeline: ""
          },
          immediate_needs: [], // travel, work, family, etc.
          motivation_sources: [] // what drives their learning
        },
        
        // Communication Patterns
        communication_patterns: {
          conversation_starters: [], // preferred topics to begin with
          humor_style: "", // dry, playful, serious, etc.
          cultural_background: "",
          professional_context: ""
        },
        
        // Practical Usage Context
        practical_usage: {
          social_connections: [], // who they'll use the language with
          geographic_relevance: "" // where they'll use the language
        },
        
        // Meta-Learning Awareness
        meta_learning: {
          strategy_preferences: [], // visual, auditory, kinesthetic, etc.
          confidence_building_needs: [] // areas where they need encouragement
        },
        
        // Session Tracking
        conversation_notes: "",
        last_session: new Date().toISOString(),
        session_count: 0,
        created_at: new Date().toISOString()
      };
    }
    
    // Update last session access
    profile.last_session = new Date().toISOString();
    profile.session_count = (profile.session_count || 0) + 1;
    
    // Save updated profile back to localStorage
    localStorage.setItem(storageKey, JSON.stringify(profile));
    
    debugLog(`✅ Profile retrieved for ${args.user_id} (session #${profile.session_count})`);
    debugLog(`📊 Profile data: ${JSON.stringify(profile, null, 2)}`);
    return profile;
  } catch (error) {
    debugLog(`❌ Error getting user profile: ${error.message}`, true);
    return { error: error.message };
  }
}

async function handleUpdateUserProfile(args) {
  try {
    debugLog(`💾 STARTING UPDATE for user: ${args.user_id}`);
    debugLog(`📝 Raw updates received: ${JSON.stringify(args.updates, null, 2)}`);
    
    // Get current profile from localStorage
    const storageKey = `user_profile_${args.user_id}`;
    const storedData = localStorage.getItem(storageKey);
    
    let currentProfile = {};
    if (storedData) {
      currentProfile = JSON.parse(storedData);
      debugLog(`📋 Current profile from localStorage: ${JSON.stringify(currentProfile, null, 2)}`);
    } else {
      debugLog(`⚠️ No existing profile found in localStorage, creating base profile`);
      currentProfile = {
        user_id: args.user_id,
        language_level: "beginner",
        mistake_patterns: [],
        mastery_status: { learned: [], struggling: [], forgotten: [] },
        conversation_notes: "",
        interests: [],
        session_count: 0,
        created_at: new Date().toISOString()
      };
    }
    
    // Build updated profile
    const updatedProfile = { ...currentProfile };
    
    debugLog(`🏗️ Base profile before updates: ${JSON.stringify(updatedProfile, null, 2)}`);
    
    // Apply updates with detailed logging for each section
    
    // Language Background
    if (args.updates.reference_language) {
      debugLog(`🌍 Updating reference_language: "${currentProfile.reference_language}" → "${args.updates.reference_language}"`);
      updatedProfile.reference_language = args.updates.reference_language;
    }
    
    // L1 Updates
    if (args.updates.l1) {
      debugLog(`🎯 Updating L1 (primary language): ${JSON.stringify(args.updates.l1, null, 2)}`);
      if (args.updates.l1.language) updatedProfile.l1.language = args.updates.l1.language;
      if (args.updates.l1.level) updatedProfile.l1.level = args.updates.l1.level;
      if (args.updates.l1.mistake_patterns) {
        updatedProfile.l1.mistake_patterns = [...(updatedProfile.l1.mistake_patterns || []), ...args.updates.l1.mistake_patterns];
      }
      if (args.updates.l1.mastery_updates) {
        if (args.updates.l1.mastery_updates.learned) {
          updatedProfile.l1.mastery_status.learned = [...new Set([...(updatedProfile.l1.mastery_status.learned || []), ...args.updates.l1.mastery_updates.learned])];
        }
        if (args.updates.l1.mastery_updates.struggling) {
          updatedProfile.l1.mastery_status.struggling = [...new Set([...(updatedProfile.l1.mastery_status.struggling || []), ...args.updates.l1.mastery_updates.struggling])];
        }
        if (args.updates.l1.mastery_updates.forgotten) {
          updatedProfile.l1.mastery_status.forgotten = [...new Set([...(updatedProfile.l1.mastery_status.forgotten || []), ...args.updates.l1.mastery_updates.forgotten])];
        }
      }
      if (args.updates.l1.specific_goals) {
        updatedProfile.l1.specific_goals = [...new Set([...(updatedProfile.l1.specific_goals || []), ...args.updates.l1.specific_goals])];
      }
    }
    
    // L2/L3 Updates (similar structure but optional)
    if (args.updates.l2) {
      debugLog(`🎯 Updating L2 (secondary language): ${JSON.stringify(args.updates.l2, null, 2)}`);
      updatedProfile.l2 = { ...updatedProfile.l2, ...args.updates.l2 };
    }
    
    if (args.updates.l3) {
      debugLog(`🎯 Updating L3 (tertiary language): ${JSON.stringify(args.updates.l3, null, 2)}`);
      updatedProfile.l3 = { ...updatedProfile.l3, ...args.updates.l3 };
    }
    
    // Learning Style Updates
    if (args.updates.learning_style) {
      debugLog(`🎨 Updating learning style: ${JSON.stringify(args.updates.learning_style, null, 2)}`);
      updatedProfile.learning_style = { ...updatedProfile.learning_style, ...args.updates.learning_style };
      if (args.updates.learning_style.cultural_learning_interests) {
        updatedProfile.learning_style.cultural_learning_interests = [...new Set([...(updatedProfile.learning_style.cultural_learning_interests || []), ...args.updates.learning_style.cultural_learning_interests])];
      }
    }
    
    // Personal Context Updates
    if (args.updates.personal_context) {
      debugLog(`🎯 Updating personal context: ${JSON.stringify(args.updates.personal_context, null, 2)}`);
      updatedProfile.personal_context = { ...updatedProfile.personal_context, ...args.updates.personal_context };
      if (args.updates.personal_context.goals_and_timeline) {
        updatedProfile.personal_context.goals_and_timeline = { ...updatedProfile.personal_context.goals_and_timeline, ...args.updates.personal_context.goals_and_timeline };
      }
      if (args.updates.personal_context.immediate_needs) {
        updatedProfile.personal_context.immediate_needs = [...new Set([...(updatedProfile.personal_context.immediate_needs || []), ...args.updates.personal_context.immediate_needs])];
      }
      if (args.updates.personal_context.motivation_sources) {
        updatedProfile.personal_context.motivation_sources = [...new Set([...(updatedProfile.personal_context.motivation_sources || []), ...args.updates.personal_context.motivation_sources])];
      }
    }
    
    // Communication Patterns Updates
    if (args.updates.communication_patterns) {
      debugLog(`💬 Updating communication patterns: ${JSON.stringify(args.updates.communication_patterns, null, 2)}`);
      updatedProfile.communication_patterns = { ...updatedProfile.communication_patterns, ...args.updates.communication_patterns };
      if (args.updates.communication_patterns.conversation_starters) {
        updatedProfile.communication_patterns.conversation_starters = [...new Set([...(updatedProfile.communication_patterns.conversation_starters || []), ...args.updates.communication_patterns.conversation_starters])];
      }
    }
    
    // Practical Usage Updates
    if (args.updates.practical_usage) {
      debugLog(`🌍 Updating practical usage: ${JSON.stringify(args.updates.practical_usage, null, 2)}`);
      updatedProfile.practical_usage = { ...updatedProfile.practical_usage, ...args.updates.practical_usage };
      if (args.updates.practical_usage.social_connections) {
        updatedProfile.practical_usage.social_connections = [...new Set([...(updatedProfile.practical_usage.social_connections || []), ...args.updates.practical_usage.social_connections])];
      }
    }
    
    // Meta-Learning Updates
    if (args.updates.meta_learning) {
      debugLog(`🧠 Updating meta-learning: ${JSON.stringify(args.updates.meta_learning, null, 2)}`);
      updatedProfile.meta_learning = { ...updatedProfile.meta_learning, ...args.updates.meta_learning };
      if (args.updates.meta_learning.strategy_preferences) {
        updatedProfile.meta_learning.strategy_preferences = [...new Set([...(updatedProfile.meta_learning.strategy_preferences || []), ...args.updates.meta_learning.strategy_preferences])];
      }
      if (args.updates.meta_learning.confidence_building_needs) {
        updatedProfile.meta_learning.confidence_building_needs = [...new Set([...(updatedProfile.meta_learning.confidence_building_needs || []), ...args.updates.meta_learning.confidence_building_needs])];
      }
    }
    
    // General Session Notes
    if (args.updates.conversation_notes) {
      debugLog(`💭 Updating conversation notes: "${currentProfile.conversation_notes}" → "${args.updates.conversation_notes}"`);
      updatedProfile.conversation_notes = args.updates.conversation_notes;
    }
    
    // Add update metadata
    updatedProfile.last_updated = new Date().toISOString();
    
    debugLog(`🚀 Final profile to save: ${JSON.stringify(updatedProfile, null, 2)}`);
    
    // Save to localStorage
    localStorage.setItem(storageKey, JSON.stringify(updatedProfile));
    
    // Verify the save
    const verification = localStorage.getItem(storageKey);
    if (verification) {
      const verifyParsed = JSON.parse(verification);
      debugLog(`✅ Verification - profile saved successfully to localStorage`);
      debugLog(`🔍 Saved data: ${JSON.stringify(verifyParsed, null, 2)}`);
    } else {
      throw new Error('Failed to save to localStorage');
    }
    
    const result = {
      success: true,
      user_id: args.user_id,
      updated_at: updatedProfile.last_updated,
      updates_applied: Object.keys(args.updates),
      profile: updatedProfile
    };
    
    debugLog(`🎉 Profile update completed successfully!`);
    return result;
  } catch (error) {
    debugLog(`💥 UPDATE ERROR: ${error.message}`, true);
    debugLog(`📚 Error stack: ${error.stack}`, true);
    return { error: error.message };
  }
}

export async function initOpenAIRealtime(streamCallback, eventCallback) {
  
  // Store the callback for later use
  onRemoteStreamCallback = streamCallback;
  onEventCallback = eventCallback;
  debugLog("Initializing OpenAI Realtime...");

  // Prepare MediaRecorder
  await userAudioMgr.init();
  await aiAudioMgr.init();
  // Create PTT button
  createPTTButton();
  
  // The actual connection will happen when the button is first pressed
  return true;
}

// Track if PTT is currently pressed
let isPTTPressed = false;

function createPTTButton() {
  // Create a floating PTT button
  pttButton = document.createElement('button');
  pttButton.id = 'ptt-button';
  pttButton.innerText = 'Push to Talk';
  pttButton.style.position = 'fixed';
  pttButton.style.bottom = '20px';
  pttButton.style.left = '50%';
  pttButton.style.transform = 'translateX(-50%)';
  pttButton.style.width = '120px';
  pttButton.style.height = '120px';
  pttButton.style.borderRadius = '50%';
  pttButton.style.backgroundColor = '#44f';  // Blue to make it more visible 
  pttButton.style.color = 'white';
  pttButton.style.border = 'none';
  pttButton.style.boxShadow = '0 4px 10px rgba(0,0,0,0.5)';
  pttButton.style.cursor = 'pointer';
  pttButton.style.zIndex = '1001';  // Higher zIndex to ensure it's visible
  pttButton.style.fontSize = '16px';
  pttButton.style.fontWeight = 'bold';
  pttButton.style.fontFamily = 'Arial, sans-serif';
  
  // Test onclick to verify basic functionality
  pttButton.onclick = () => {
    debugLog('Button clicked! Basic click functionality works.');
  };
  
  // Add event listeners for PTT button
  pttButton.addEventListener('mousedown', (e) => {
    debugLog('mousedown event fired');
    isPTTPressed = true;
    handlePTTPress(e);
  });
  
  // Listen for mouseup on the document to catch releases outside the button
  document.addEventListener('mouseup', (e) => {
    if (isPTTPressed) {
      debugLog('document mouseup event fired - releasing PTT');
      isPTTPressed = false;
      handlePTTRelease(e);
    }
  });
  
  // Touch controls for mobile – hold to talk
  pttButton.addEventListener('touchstart', (e) => {
    debugLog('touchstart event fired');
    e.preventDefault();
    if (!isPTTPressed) {
      isPTTPressed = true;
      handlePTTPress(e);
    }
  }, { passive: false });

  pttButton.addEventListener('touchmove', (e) => {
    if (isPTTPressed) {
      e.preventDefault();
    }
  }, { passive: false });

  pttButton.addEventListener('touchend', (e) => {
    debugLog('touchend event fired');
    e.preventDefault();
    if (isPTTPressed) {
      isPTTPressed = false;
      handlePTTRelease(e);
    }
  }, { passive: false });

  pttButton.addEventListener('touchcancel', (e) => {
    debugLog('touchcancel event fired');
    e.preventDefault();
    if (isPTTPressed) {
      isPTTPressed = false;
      handlePTTRelease(e);
    }
  }, { passive: false });
  
  document.body.appendChild(pttButton);
  debugLog('PTT button created and added to document body');
}

async function handlePTTPress(e) {
  debugLog('PTT button pressed handler called');

  pendingUserRecordPromise = null;
  pendingUserRecord = null;
  
  // Connect if not already connected
  if (!isConnected) {
    try {
      debugLog('Not connected yet, initiating connection...');
      await connect();
      // Don't enable mic yet if we're still connecting
      if (!isConnected) {
        debugLog('Connection initiated but not yet established');
        return;
      }
    } catch (error) {
      debugLog(`Connection failed: ${error.message}`, true);
      return;
    }
  }

  // start capturing user audio
  if (!ENABLE_SEMANTIC_VAD) {
    if (dataChannel && dataChannel.readyState === 'open') {
      dataChannel.send(JSON.stringify({
        type: 'input_audio_buffer.clear',
        event_id: crypto.randomUUID()
      }));
      debugLog('Sent input_audio_buffer.clear');
    } else {
      debugLog('Cannot clear buffer - data channel not open', true);
    }
  }

  userAudioMgr.startRecording();
  // Mimic the server's speech_started event so the UI behaves the same
  if (onEventCallback) {
    onEventCallback({ type: 'input_audio_buffer.speech_started' });
  }
  enableMicrophone();
}

function handlePTTRelease(e) {
  debugLog('PTT button released handler called');
  
  // Stop local recording immediately to capture full speech
  if (userAudioMgr.isRecording) {
      pendingUserRecordPromise = userAudioMgr
        .stopRecording('...')
      .then(record => {
        if (!record) return null;
        pendingUserRecord = record;
        if (onEventCallback) {
          onEventCallback({ type: 'utterance.added', record });
        }
        return record;
      })
      .catch(err => debugLog(`User stop error: ${err}`, true));
  }

  // Add buffer time before finalizing the audio processing
  setTimeout(() => {
    debugLog('Buffer time completed, finalizing audio processing');
    disableMicrophone();

    // Signal to consumers that speech has ended
    if (onEventCallback) {
      onEventCallback({ type: 'input_audio_buffer.speech_stopped' });
    }

    // With turn detection disabled we must explicitly commit the audio
    // buffer and request a response from the server.
    if (!ENABLE_SEMANTIC_VAD) {
      if (dataChannel && dataChannel.readyState === 'open') {
        dataChannel.send(JSON.stringify({
          type: 'input_audio_buffer.commit',
          event_id: crypto.randomUUID()
        }));
        debugLog('Sent input_audio_buffer.commit');

        dataChannel.send(JSON.stringify({
          type: 'response.create',
          event_id: crypto.randomUUID()
        }));
        debugLog('Sent response.create');
      } else {
        debugLog('Cannot commit audio - data channel not open', true);
      }
    }
  }, 500); // 500ms buffer time
}

export async function connect() {
    try {
    debugLog('Connecting to OpenAI Realtime API...');
    pttButton.innerText = 'Connecting...';
    pttButton.style.backgroundColor = '#666';

    // Get token
    debugLog('Requesting token from server...');
    const tokenResponse = await fetch('/token');
    if (!tokenResponse.ok) throw new Error(`Failed to get token: ${tokenResponse.status}`);
    const data = await tokenResponse.json();
    const EPHEMERAL_KEY = data.client_secret.value;

    // Create PeerConnection
    peerConnection = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
    peerConnection.addTransceiver("audio", { direction: "sendrecv" });
    peerConnection.onicecandidate = e => debugLog("ICE candidate: " + JSON.stringify(e.candidate));
    peerConnection.onconnectionstatechange = () => debugLog("Connection state: " + peerConnection.connectionState);

    peerConnection.oniceconnectionstatechange = () => {
        const state = peerConnection.iceConnectionState;
        debugLog("ICE state: " + state);
        if (state === "disconnected") {
          // Optional: try to recover without user action:
          debugLog("🌀 ICE disconnected — restarting ICE");
          peerConnection.restartIce();
        }
        if (state === "failed") {
          debugLog("⚠️ ICE truly failed — marking disconnected");
          isConnected = false;
          pttButton.innerText = "Reconnect";
          pttButton.style.backgroundColor = "#888";
        }
      };

    // Media and DataChannel
    const mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioTrack = mediaStream.getTracks()[0];
    audioTrack.enabled = false;
    peerConnection.addTrack(audioTrack);
    dataChannel = peerConnection.createDataChannel('oai-events');
    
    dataChannel.onclose = () => {
        debugLog('🔌 Data channel closed — marking disconnected');
        isConnected = false;
        if (pttButton) {
          pttButton.innerText = 'Reconnect';
          pttButton.style.backgroundColor = '#888';
        }
      };

    // Set up Whisper+VAD on open
    dataChannel.onopen = async () => {
        debugLog('Data channel opened');
        isConnected = true;
        pttButton.innerText = 'Push to Talk';
        pttButton.style.backgroundColor = '#44f';


        // ─── load & send system prompt from YAML ───
        try {
            const res = await fetch('/prompts/systemPrompt.yaml');
            if (!res.ok) throw new Error(`YAML load failed: ${res.status}`);
            const yamlText = await res.text();
            const obj = jsyaml.load(yamlText);
            const sysText = obj.prompt;

            const sysEvent = {
            type: 'conversation.item.create',
            event_id: crypto.randomUUID(),
            item: {
                type: 'message',
                role: 'system',
                content: [
                { type: 'input_text', text: sysText }
                ]
            }
            };
            dataChannel.send(JSON.stringify(sysEvent));
            debugLog('Sent system prompt from YAML');
        } catch (err) {
            debugLog(`Failed to load system prompt YAML: ${err.message}`, true);
        }

        // ─── enable audio transcription and VAD ───

        const sessionUpdate = {
        type: 'session.update',
        session: {
            input_audio_transcription: { model: 'gpt-4o-mini-transcribe' },
            turn_detection: ENABLE_SEMANTIC_VAD ? {
              type: 'semantic_vad',
              eagerness: 'low', // optional
              create_response: true,
              interrupt_response: false,
            } : null,
            tools: [
              {
                type: "function",
                name: "get_user_profile",
                description: "Retrieve the user's current learning profile to personalize the tutoring session.",
                parameters: {
                  type: "object",
                  properties: {
                    user_id: {
                      type: "string",
                      description: "The user's unique identifier"
                    }
                  },
                  required: ["user_id"]
                }
              },
              {
                type: "function", 
                name: "update_user_profile",
                description: "Update the user's comprehensive learning profile with new information discovered during the tutoring session.",
                parameters: {
                  type: "object",
                  properties: {
                    user_id: {
                      type: "string",
                      description: "The user's unique identifier"
                    },
                    updates: {
                      type: "object",
                      properties: {
                        reference_language: {
                          type: "string",
                          description: "User's native or strongest language"
                        },
                        l1: {
                          type: "object",
                          description: "Primary target language updates",
                          properties: {
                            language: {type: "string"},
                            level: {type: "string", enum: ["beginner", "elementary", "intermediate", "upper-intermediate", "advanced", "proficient"]},
                            mistake_patterns: {
                              type: "array",
                              items: {
                                type: "object",
                                properties: {
                                  type: {type: "string", enum: ["grammar", "vocabulary", "pronunciation", "pragmatics", "fluency"]},
                                  specific: {type: "string"},
                                  example: {type: "string"}
                                }
                              }
                            },
                            mastery_updates: {
                              type: "object",
                              properties: {
                                learned: {type: "array", items: {type: "string"}},
                                struggling: {type: "array", items: {type: "string"}},
                                forgotten: {type: "array", items: {type: "string"}}
                              }
                            },
                            specific_goals: {type: "array", items: {type: "string"}}
                          }
                        },
                        l2: {
                          type: "object",
                          description: "Secondary target language updates (optional)"
                        },
                        l3: {
                          type: "object", 
                          description: "Tertiary target language updates (optional)"
                        },
                        learning_style: {
                          type: "object",
                          properties: {
                            correction_style: {type: "string", enum: ["gentle", "direct", "delayed", "implicit", "explicit"]},
                            challenge_level: {type: "string", enum: ["comfortable", "moderate", "challenging"]},
                            session_structure: {type: "string", enum: ["structured", "flexible", "conversation-focused", "task-based"]},
                            cultural_learning_interests: {type: "array", items: {type: "string"}}
                          }
                        },
                        personal_context: {
                          type: "object",
                          properties: {
                            goals_and_timeline: {
                              type: "object",
                              properties: {
                                short_term: {type: "string"},
                                long_term: {type: "string"},
                                timeline: {type: "string"}
                              }
                            },
                            immediate_needs: {type: "array", items: {type: "string"}},
                            motivation_sources: {type: "array", items: {type: "string"}}
                          }
                        },
                        communication_patterns: {
                          type: "object",
                          properties: {
                            conversation_starters: {type: "array", items: {type: "string"}},
                            humor_style: {type: "string"},
                            cultural_background: {type: "string"},
                            professional_context: {type: "string"}
                          }
                        },
                        practical_usage: {
                          type: "object",
                          properties: {
                            social_connections: {type: "array", items: {type: "string"}},
                            geographic_relevance: {type: "string"}
                          }
                        },
                        meta_learning: {
                          type: "object",
                          properties: {
                            strategy_preferences: {type: "array", items: {type: "string"}},
                            confidence_building_needs: {type: "array", items: {type: "string"}}
                          }
                        },
                        conversation_notes: {
                          type: "string",
                          description: "General observations about the session"
                        }
                      }
                    }
                  },
                  required: ["user_id", "updates"]
                }
              }
            ]
        }
        };
        dataChannel.send(JSON.stringify(sessionUpdate));
        debugLog('Sent session.update ▶︎ enable audio transcription');
    };

    // —————————————————————————————————————————
    // NEW: Buffer for assembling the AI turn
    let aiTranscript = '';

    // 1) Catch remote audio and wire up AI recorder
    peerConnection.ontrack = async (event) => {
        debugLog("✅ Remote track received from OpenAI");
        const remoteStream = event.streams[0];

        // Pass to UI
        if (onRemoteStreamCallback) {
        onRemoteStreamCallback(remoteStream);
        } else {
        const remoteAudio = document.createElement('audio');
        remoteAudio.srcObject = remoteStream;
        remoteAudio.autoplay = true;
        document.body.appendChild(remoteAudio);
        }

        // Re-init AI AudioManager on that stream
        aiAudioMgr.stream = remoteStream;
        try {
        await aiAudioMgr.init();
        debugLog("✅ AI AudioManager initialized with remote stream");
        } catch (err) {
        debugLog(`❌ AI AudioManager init error: ${err}`, true);
        }
    };

    // 2) Handle all incoming events
    dataChannel.addEventListener("message", async (e) => {
        const event = JSON.parse(e.data);
        debugLog(`Received event: ${event.type}`);
        if (!event.timestamp) event.timestamp = new Date().toLocaleTimeString();
      
        // Relay raw events
        if (onEventCallback) onEventCallback(event);
      

        // — AI interim speech (start recorder + accumulate text + offsets) —
        if (event.type === 'response.audio_transcript.delta' && typeof event.delta === 'string') {
            if (!aiAudioMgr.isRecording) {
            debugLog("▶️ [AI] startRecording()");
            aiRecordingStartTime = performance.now();
            aiWordOffsets = [];
            aiAudioMgr.startRecording();
            }
            // capture offset
            const offsetMs = performance.now() - aiRecordingStartTime;
            aiWordOffsets.push({ word: event.delta, offsetMs });

            aiTranscript += event.delta;
            // Pass delta events directly to UI (no conversion to transcript.word)
            // The UI will handle accumulating deltas into the bubble
        }
      

        // — stop recording exactly once, at the end of the audio buffer —
        if (event.type === 'output_audio_buffer.stopped') {
            if (aiAudioMgr.isRecording) {
                debugLog("🔴 [AI] output_audio_buffer.stopped — stopping recorder");
                debugLog(`🔍 [AI] Final transcript length: ${aiTranscript.trim().length} chars`);
                stopAndTranscribe(aiAudioMgr, aiTranscript.trim()).then(record => {
                    if (!record) {
                        debugLog("⚠️ [AI] stopAndTranscribe returned null record", true);
                        return;
                    }
                    debugLog(`✅ [AI] Created final record: ${record.id}, text: "${record.text.substring(0, 50)}..."`);
                    onEventCallback({ type: 'utterance.added', record });

                // reset for next turn
                aiTranscript = '';
                aiWordOffsets = [];
                aiRecordingStartTime = null;
                })
                .catch(err => debugLog(`AI transcription error: ${err}`, true));
            } else {
            debugLog("⚠️ [AI] got buffer-stopped but was not recording, skipping");
            }
        }
      
        // — user speech done (server-VAD) — (unchanged)
        if (event.type === 'conversation.item.input_audio_transcription.completed') {
          const t = (event.transcript || '').trim();
          if (t) {
            for (const w of t.split(/\s+/)) {
              onEventCallback({
                type: 'transcript.word',
                word: w,
                speaker: 'user'
              });
            }

            const finalize = (record) => {
              record.text = t;
              fetchWordTimings(record.audioBlob)
                .then(({ words, fullText }) => {
                  record.wordTimings = words;
                  record.fullText = fullText;
                })
                .catch(() => {
                  record.wordTimings = [];
                  record.fullText = t;
                })
                .finally(() => {
                  StorageService.addUtterance(record);
                  onEventCallback({ type: 'utterance.added', record });
                  if (pendingUserRecord === record) pendingUserRecord = null;
                  pendingUserRecordPromise = null;
                });
            };

            if (pendingUserRecord) {
              finalize(pendingUserRecord);
            } else if (pendingUserRecordPromise) {
              pendingUserRecordPromise
                .then(record => {
                  if (record) finalize(record);
                })
                .catch(err => debugLog(`User transcription error: ${err}`, true));
            } else {
              stopAndTranscribe(userAudioMgr, t)
                .then(record => {
                  if (record) finalize(record);
                })
                .catch(err => debugLog(`User transcription error: ${err}`, true));
            }
          }

          return; // swallow
        }
      
        // — handle final AI transcription completion —
        if (event.type === 'response.audio_transcript.done' && typeof event.transcript === 'string') {
          const finalTranscript = event.transcript.trim();
          debugLog(`✅ Final AI transcript: "${finalTranscript}"`);
          
          // Relay this event to the UI so it can handle final transcription logic
          if (onEventCallback) {
            onEventCallback({
              ...event,
              transcript: finalTranscript,
              speaker: 'ai'
            });
          }
        }

        // — handle function calls —
        if (event.type === 'response.function_call_arguments.delta') {
          debugLog(`Function call delta event: ${JSON.stringify(event)}`);
          // Accumulate function call arguments if needed
          if (onEventCallback) onEventCallback(event);
        }

        if (event.type === 'response.function_call_arguments.done') {
          debugLog(`🚀 FUNCTION CALL COMPLETED: ${event.name}`);
          debugLog(`📋 Full event: ${JSON.stringify(event)}`);
          
          try {
            debugLog(`📝 Parsing arguments: ${event.arguments}`);
            const args = JSON.parse(event.arguments);
            debugLog(`✅ Parsed args: ${JSON.stringify(args, null, 2)}`);
            let result = null;

            debugLog(`🎯 Function name: "${event.name}"`);
            if (event.name === 'get_user_profile') {
              debugLog(`🔍 Calling handleGetUserProfile...`);
              result = await handleGetUserProfile(args);
              debugLog(`📊 Get profile result: ${JSON.stringify(result, null, 2)}`);
            } else if (event.name === 'update_user_profile') {
              debugLog(`💾 Calling handleUpdateUserProfile...`);
              debugLog(`📝 Update data: ${JSON.stringify(args.updates, null, 2)}`);
              result = await handleUpdateUserProfile(args);
              debugLog(`✅ Update profile result: ${JSON.stringify(result, null, 2)}`);
            } else {
              debugLog(`❌ Unknown function call: ${event.name}`, true);
              result = { error: `Unknown function: ${event.name}` };
            }

            // Send function call result back to OpenAI
            const functionResultEvent = {
              type: 'conversation.item.create',
              event_id: crypto.randomUUID(),
              item: {
                type: 'function_call_output',
                call_id: event.call_id,
                output: JSON.stringify(result)
              }
            };

            debugLog(`Sending function result: ${JSON.stringify(functionResultEvent)}`);
            dataChannel.send(JSON.stringify(functionResultEvent));
            debugLog(`Sent function result for ${event.name}`);

            // Create response to continue conversation
            const responseEvent = {
              type: 'response.create',
              event_id: crypto.randomUUID()
            };
            dataChannel.send(JSON.stringify(responseEvent));
            debugLog(`Sent response.create to continue conversation`);

          } catch (error) {
            debugLog(`Function call error: ${error.message}`, true);
            debugLog(`Error stack: ${error.stack}`, true);
            
            // Send error result
            const errorResultEvent = {
              type: 'conversation.item.create',
              event_id: crypto.randomUUID(),
              item: {
                type: 'function_call_output', 
                call_id: event.call_id,
                output: JSON.stringify({ error: error.message })
              }
            };
            dataChannel.send(JSON.stringify(errorResultEvent));
          }
        }
      
        // — drop the old “response.done” or “response.audio_transcript.done” blocks entirely —
      });
      
  

    
    
    // Create and set local description
    debugLog('Creating offer...');
    try {
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      debugLog('Local description set');
    } catch (sdpError) {
      debugLog(`Error creating SDP offer: ${sdpError.message}`, true);
      throw new Error(`SDP creation failed: ${sdpError.message}`);
    }
    
    // Exchange SDP with OpenAI server
    debugLog('Exchanging SDP with OpenAI...');
    const baseUrl = 'https://api.openai.com/v1/realtime';
    const model = 'gpt-4o-mini-realtime-preview-2024-12-17';
    
    try {
      const sdpResponse = await fetch(`${baseUrl}?model=${model}`, {
        method: 'POST',
        body: peerConnection.localDescription.sdp,
        headers: {
          'Authorization': `Bearer ${EPHEMERAL_KEY}`,
          'Content-Type': 'application/sdp'
        }
      });
      
      if (!sdpResponse.ok) {
        const errorText = await sdpResponse.text();
        debugLog(`SDP exchange failed: ${sdpResponse.status} ${sdpResponse.statusText}`, true);
        debugLog(`Error details: ${errorText}`, true);
        throw new Error(`SDP exchange failed: ${sdpResponse.status} ${sdpResponse.statusText}`);
      }
      
      // Set remote description
      const sdpText = await sdpResponse.text();
      debugLog('SDP response received, setting remote description...');
      const answer = {
        type: 'answer',
        sdp: sdpText
      };
      
      await peerConnection.setRemoteDescription(answer);
      debugLog('Remote description set');
    } catch (fetchError) {
      debugLog(`Error during SDP exchange: ${fetchError.message}`, true);
      throw new Error(`SDP exchange failed: ${fetchError.message}`);
    }
    
    
    debugLog('Connection established successfully');
    isConnected = true;
    
  } catch (error) {
    debugLog(`Connection error: ${error.message}`, true);
    pttButton.innerText = 'Error';
    pttButton.style.backgroundColor = '#c00';
    
    // Reset after 3 seconds
    setTimeout(() => {
      pttButton.innerText = 'Try Again';
      pttButton.style.backgroundColor = '#44f';
    }, 3000);
    
    throw error;
  }
}



function enableMicrophone() {
  if (audioTrack && isConnected) {
    audioTrack.enabled = true;
    isMicActive = true;
    pttButton.style.backgroundColor = '#f00'; // Red when active
    pttButton.innerText = 'Talking';
    debugLog('Microphone enabled');
  } else {
    if (!audioTrack) {
      debugLog('Cannot enable microphone - no audio track available', true);
    }
    if (!isConnected) {
      debugLog('Cannot enable microphone - not connected to OpenAI', true);
    }
  }
}

function disableMicrophone() {
  if (audioTrack) {
    audioTrack.enabled = false;
    isMicActive = false;
    pttButton.style.backgroundColor = '#44f'; // Blue when inactive
    pttButton.innerText = 'Push to Talk';
    debugLog('Microphone disabled');
  } else {
    debugLog('Cannot disable microphone - no audio track available', true);
  }
}

export function sendTextMessage(text) {
  if (!dataChannel || dataChannel.readyState !== 'open') {
    debugLog('Cannot send message: data channel not open', true);
    return false;
  }
  
  const event = {
    type: 'conversation.item.create',
    event_id: crypto.randomUUID(),
    item: {
      type: 'message',
      role: 'user',
      content: [
        {
          type: 'input_text',
          text
        }
      ]
    }
  };
  
  dataChannel.send(JSON.stringify(event));
  debugLog(`Sent text: ${text}`);
  
  // Send response.create event
  const responseEvent = {
    type: 'response.create',
    event_id: crypto.randomUUID()
  };
  dataChannel.send(JSON.stringify(responseEvent));
  
  return true;
}

export function isConnectedToOpenAI() {
  return isConnected;
}

export function cleanup() {
  if (dataChannel) {
    dataChannel.close();
    dataChannel = null;
  }
  
  if (peerConnection) {
    peerConnection.getSenders().forEach(sender => {
      if (sender.track) {
        sender.track.stop();
      }
    });
    peerConnection.close();
    peerConnection = null;
  }
  
  if (pttButton && pttButton.parentNode) {
    pttButton.parentNode.removeChild(pttButton);
    pttButton = null;
  }
  
  audioTrack = null;
  isConnected = false;
  isMicActive = false;
  
  debugLog('OpenAI Realtime resources cleaned up');
}