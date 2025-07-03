// openaiRealtime.js
// This module handles WebRTC connections to OpenAI's Realtime API


import { AudioManager } from './audio/audioManager';
import { StorageService } from './core/storageService';
import jsyaml from 'js-yaml';


let peerConnection = null;
let dataChannel = null;
let audioTrack = null;
// eslint-disable-next-line no-unused-vars
let isMicActive = false;
let isConnected = false;
let pttButton = null;
let onRemoteStreamCallback = null;
let onEventCallback = null;
let aiRecordingStartTime = null;
let aiWordOffsets = [];
let pendingUserRecordPromise = null;
let pendingUserRecord = null;

// Mobile device detection and settings
const isMobileDevice = () => {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
         ('ontouchstart' in window) ||
         (navigator.maxTouchPoints > 0);
};

const MOBILE_DEVICE = isMobileDevice();
const DEVICE_TYPE = MOBILE_DEVICE ? 'mobile' : 'desktop';

// Mobile debug logging
function mobileDebug(message) {
  if (MOBILE_DEVICE) {
    const debugPanel = document.getElementById('mobileDebug');
    const debugOutput = document.getElementById('debugOutput');
    if (debugPanel && debugOutput) {
      debugPanel.style.display = 'block';
      const timestamp = new Date().toLocaleTimeString();
      debugOutput.innerHTML += `<div>[${timestamp}] ${message}</div>`;
      debugOutput.scrollTop = debugOutput.scrollHeight;
    }
  }
  // eslint-disable-next-line no-console
  console.log(`[MOBILE] ${message}`);
}

// Toggle to switch between semantic VAD and manual push‑to‑talk control.
// When false, turn detection will be disabled and the client must
// explicitly commit audio turns via the PTT button.
const ENABLE_SEMANTIC_VAD = false;


// Send a Blob to /transcribe and return Whisper’s word timestamps
async function fetchWordTimings(blob) {
    const fd = new FormData();
    fd.append('file', blob, 'utterance.webm');
    const res = await fetch(`${__API_URL__}/transcribe`, { method: 'POST', body: fd });
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
          const { words, fullText } = await fetchWordTimings(record.audioBlob);
          record.wordTimings = words;
          record.fullText    = fullText;
        } catch (err) {
          // eslint-disable-next-line no-console
    console.error(`Word timing fetch failed: ${err.message}`);
          record.wordTimings = [];
          record.fullText    = record.text; // fallback to original
        }
        return record;
      });
  }


// our recorder for “utterance” blobs
const userAudioMgr = new AudioManager({ speaker: 'user' });
const aiAudioMgr = new AudioManager({ speaker: 'ai' });


// Function handlers for memory management
async function handleGetUserProfile(args) {
  try {
    
    // Get profile from localStorage
    const storageKey = `user_profile_${args.user_id}`;
    const storedData = localStorage.getItem(storageKey);
    
    let profile;
    if (storedData) {
      profile = JSON.parse(storedData);
    } else {
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
    
    return profile;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(`Error getting user profile: ${error.message}`);
    return { error: error.message };
  }
}

async function handleUpdateUserProfile(args) {
  try {
    
    // Get current profile from localStorage
    const storageKey = `user_profile_${args.user_id}`;
    const storedData = localStorage.getItem(storageKey);
    
    let currentProfile = {};
    if (storedData) {
      currentProfile = JSON.parse(storedData);
    } else {
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
    
    
    // Apply updates with detailed logging for each section
    
    // Language Background
    if (args.updates.reference_language) {
      updatedProfile.reference_language = args.updates.reference_language;
    }
    
    // L1 Updates
    if (args.updates.l1) {
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
      updatedProfile.l2 = { ...updatedProfile.l2, ...args.updates.l2 };
    }
    
    if (args.updates.l3) {
      updatedProfile.l3 = { ...updatedProfile.l3, ...args.updates.l3 };
    }
    
    // Learning Style Updates
    if (args.updates.learning_style) {
      updatedProfile.learning_style = { ...updatedProfile.learning_style, ...args.updates.learning_style };
      if (args.updates.learning_style.cultural_learning_interests) {
        updatedProfile.learning_style.cultural_learning_interests = [...new Set([...(updatedProfile.learning_style.cultural_learning_interests || []), ...args.updates.learning_style.cultural_learning_interests])];
      }
    }
    
    // Personal Context Updates
    if (args.updates.personal_context) {
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
        updatedProfile.communication_patterns = { ...updatedProfile.communication_patterns, ...args.updates.communication_patterns };
      if (args.updates.communication_patterns.conversation_starters) {
        updatedProfile.communication_patterns.conversation_starters = [...new Set([...(updatedProfile.communication_patterns.conversation_starters || []), ...args.updates.communication_patterns.conversation_starters])];
      }
    }
    
    // Practical Usage Updates
    if (args.updates.practical_usage) {
      updatedProfile.practical_usage = { ...updatedProfile.practical_usage, ...args.updates.practical_usage };
      if (args.updates.practical_usage.social_connections) {
        updatedProfile.practical_usage.social_connections = [...new Set([...(updatedProfile.practical_usage.social_connections || []), ...args.updates.practical_usage.social_connections])];
      }
    }
    
    // Meta-Learning Updates
    if (args.updates.meta_learning) {
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
      updatedProfile.conversation_notes = args.updates.conversation_notes;
    }
    
    // Add update metadata
    updatedProfile.last_updated = new Date().toISOString();
    
    
    // Save to localStorage
    localStorage.setItem(storageKey, JSON.stringify(updatedProfile));
    
    // Verify the save
    const verification = localStorage.getItem(storageKey);
    if (verification) {
      // eslint-disable-next-line no-unused-vars
      const verifyParsed = JSON.parse(verification);
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
    
    return result;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(`Profile update error: ${error.message}`);
    return { error: error.message };
  }
}

export async function initOpenAIRealtime(streamCallback, eventCallback) {
  
  // Store the callback for later use
  onRemoteStreamCallback = streamCallback;
  onEventCallback = eventCallback;

  // Prepare MediaRecorder
  await userAudioMgr.init();
  await aiAudioMgr.init();
  // Create PTT button
  createPTTButton();
  
  // The actual connection will happen when the button is first pressed
  return true;
}

// Track if PTT is currently pressed with mobile-specific state management
let isPTTPressed = false;
let lastTouchEventTime = 0;
// eslint-disable-next-line no-unused-vars
let touchEventCount = 0;
const MOBILE_DEBOUNCE_TIME = MOBILE_DEVICE ? 100 : 0; // 100ms debounce for mobile

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
  };
  
  // Add event listeners for PTT button
  pttButton.addEventListener('mousedown', (e) => {
    isPTTPressed = true;
    handlePTTPress(e);
  });
  
  // Listen for mouseup on the document to catch releases outside the button
  document.addEventListener('mouseup', (_e) => {
    if (isPTTPressed) {
      isPTTPressed = false;
      handlePTTRelease(_e);
    }
  });
  
  // Touch controls for mobile – hold to talk with debouncing
  pttButton.addEventListener('touchstart', (e) => {
    const now = Date.now();
    touchEventCount++;
    
    // Mobile debouncing - prevent rapid fire events
    if (MOBILE_DEVICE && (now - lastTouchEventTime) < MOBILE_DEBOUNCE_TIME) {
      e.preventDefault();
      return;
    }
    
    lastTouchEventTime = now;
    e.preventDefault();
    
    if (!isPTTPressed) {
      isPTTPressed = true;
      handlePTTPress(e);
    } else {
      // PTT already pressed
    }
  }, { passive: false });

  pttButton.addEventListener('touchmove', (e) => {
    if (isPTTPressed) {
      e.preventDefault();
    }
  }, { passive: false });

  pttButton.addEventListener('touchend', (_e) => {
    // eslint-disable-next-line no-unused-vars
    const now = Date.now();
    _e.preventDefault();
    
    if (isPTTPressed) {
      isPTTPressed = false;
      handlePTTRelease(_e);
    } else {
      // PTT not pressed
    }
  }, { passive: false });

  pttButton.addEventListener('touchcancel', (_e) => {
    _e.preventDefault();
    if (isPTTPressed) {
      isPTTPressed = false;
      handlePTTRelease(_e);
    }
  }, { passive: false });
  
  document.body.appendChild(pttButton);
}

async function handlePTTPress(_e) {

  pendingUserRecordPromise = null;
  pendingUserRecord = null;
  
  // Connect if not already connected
  if (!isConnected) {
    try {
      await connect();
      // Don't enable mic yet if we're still connecting
      if (!isConnected) {
        return;
      }
    } catch (error) {
      // eslint-disable-next-line no-console
    console.error(`Connection failed: ${error.message}`);
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
    } else {
      // eslint-disable-next-line no-console
    console.error('Cannot clear buffer - data channel not open');
    }
  }

  userAudioMgr.startRecording();
  // Mimic the server's speech_started event so the UI behaves the same
  if (onEventCallback) {
    onEventCallback({ type: 'input_audio_buffer.speech_started' });
  }
  enableMicrophone();
}

function handlePTTRelease(_e) {
  
  // Stop local recording immediately to capture full speech
  if (userAudioMgr.isRecording) {
      pendingUserRecordPromise = userAudioMgr
        .stopRecording('...')
      .then(record => {
        if (!record) return null;
        pendingUserRecord = record;
        
        // IMPORTANT: Do NOT emit utterance.added here - wait for server transcription
        // This prevents duplicate bubbles. Server transcription will enhance and emit this record.
        
        return record;
      })
      .catch(err => // eslint-disable-next-line no-console
    console.error(`User stop error: ${err}`));
  }

  // Add buffer time before finalizing the audio processing (mobile-specific timing)
  const bufferTime = MOBILE_DEVICE ? 1000 : 500; // Longer buffer for mobile devices
  
  setTimeout(() => {
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

        dataChannel.send(JSON.stringify({
          type: 'response.create',
          event_id: crypto.randomUUID()
        }));
      } else {
        // eslint-disable-next-line no-console
    console.error('Cannot commit audio - data channel not open');
      }
    }
  }, bufferTime); // Mobile-aware buffer time
}

export async function connect() {
    try {
    pttButton.innerText = 'Connecting...';
    pttButton.style.backgroundColor = '#666';

    // Mobile-specific audio initialization first
    if (MOBILE_DEVICE) {
      try {
        mobileDebug('Starting mobile audio initialization...');
        
        // Request microphone access with minimal constraints for mobile
        const mobileStream = await navigator.mediaDevices.getUserMedia({ 
          audio: true 
        });
        
        mobileDebug('Mobile microphone access granted successfully');
        
        // Store for later use
        audioTrack = mobileStream.getAudioTracks()[0];
        
        // Stop the test stream immediately to avoid conflicts
        mobileStream.getTracks().forEach(track => track.stop());
        mobileDebug('Mobile audio track stored and test stream stopped');
        
      } catch (mobileAudioError) {
        mobileDebug(`Mobile audio failed: ${mobileAudioError.name} - ${mobileAudioError.message}`);
        throw new Error(`Mobile microphone error: ${mobileAudioError.message}`);
      }
    }

    // Test backend connectivity first on mobile
    if (MOBILE_DEVICE) {
      try {
        mobileDebug('Testing backend connectivity...');
        mobileDebug(`Backend URL: ${__API_URL__}`);
        
        // Try a simple fetch first with mobile-specific options
        const healthResponse = await fetch(`${__API_URL__}/health`, { 
          method: 'GET',
          signal: AbortSignal.timeout(8000),
          mode: 'cors',
          credentials: 'omit',
          headers: {
            'Accept': 'application/json',
            'Cache-Control': 'no-cache'
          }
        });
        
        if (healthResponse.ok) {
          mobileDebug('Backend health check passed');
          const healthData = await healthResponse.text();
          mobileDebug(`Health response: ${healthData.substring(0, 50)}...`);
        } else {
          mobileDebug(`Backend health check failed: ${healthResponse.status}`);
          throw new Error(`Backend health check failed: ${healthResponse.status}`);
        }
      } catch (healthError) {
        mobileDebug(`Backend unreachable: ${healthError.name} - ${healthError.message}`);
        
        // Since mobile browser CAN reach the backend, try a simplified approach
        mobileDebug(`Mobile browser can reach backend, trying simplified fetch...`);
        
        // Try with minimal headers to avoid CORS preflight
        try {
          const simpleResponse = await fetch(`${__API_URL__}/health`, {
            signal: AbortSignal.timeout(5000)
          });
          
          if (simpleResponse.ok) {
            mobileDebug('Simplified fetch succeeded!');
          } else {
            throw new Error(`Simplified fetch failed: ${simpleResponse.status}`);
          }
        } catch (simpleError) {
          mobileDebug(`Simplified fetch failed: ${simpleError.message}`);
          // Continue anyway since browser can reach it - might be CORS-specific
          mobileDebug('Continuing despite fetch failure since browser access works...');
        }
        
        // Don't throw error - continue to token request since backend is reachable
        mobileDebug('Proceeding with token request despite connectivity test failures...');
      }
    }

    // Get token with timeout for mobile
    mobileDebug('Requesting OpenAI token...');
    const tokenController = new AbortController();
    const tokenTimeout = setTimeout(() => {
      tokenController.abort();
      mobileDebug('Token request timed out after 10 seconds');
    }, 10000); // 10 second timeout for mobile
    
    let EPHEMERAL_KEY;
    try {
      // Try multiple fetch approaches for mobile compatibility
      let tokenResponse;
      
      // First attempt: minimal fetch
      try {
        mobileDebug('Trying minimal token fetch...');
        tokenResponse = await fetch(`${__API_URL__}/token`, {
          signal: tokenController.signal
        });
      } catch (minimalError) {
        mobileDebug(`Minimal fetch failed: ${minimalError.message}`);
        
        // Second attempt: with explicit CORS settings
        mobileDebug('Trying CORS-explicit token fetch...');
        tokenResponse = await fetch(`${__API_URL__}/token`, {
          signal: tokenController.signal,
          method: 'GET',
          mode: 'cors',
          credentials: 'omit',
          headers: {
            'Accept': '*/*'
          }
        });
      }
      
      clearTimeout(tokenTimeout);
      
      if (!tokenResponse.ok) {
        mobileDebug(`Token request failed: ${tokenResponse.status} ${tokenResponse.statusText}`);
        throw new Error(`Failed to get token: ${tokenResponse.status}`);
      }
      
      mobileDebug('Token response received, parsing JSON...');
      const data = await tokenResponse.json();
      EPHEMERAL_KEY = data.client_secret.value;
      mobileDebug('OpenAI token received and parsed successfully');
    } catch (tokenError) {
      clearTimeout(tokenTimeout);
      if (tokenError.name === 'AbortError') {
        mobileDebug('Token request was aborted due to timeout');
        throw new Error('Token request timed out - check network connection');
      } else {
        mobileDebug(`Token request failed: ${tokenError.name} - ${tokenError.message}`);
        
        // For mobile debugging: show what we know works
        if (MOBILE_DEVICE) {
          mobileDebug('MOBILE WORKAROUND: Try opening the backend URL directly in browser and copying the token manually if needed');
          mobileDebug(`Backend token URL: ${__API_URL__}/token`);
        }
        
        throw new Error(`Token request failed: ${tokenError.message}`);
      }
    }

    // Create PeerConnection
    mobileDebug('Creating WebRTC PeerConnection...');
    peerConnection = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
    peerConnection.addTransceiver("audio", { direction: "sendrecv" });
    mobileDebug('PeerConnection created and audio transceiver added');
    peerConnection.onicecandidate = _e => {
      // ICE candidate handling - not implemented
    };
    peerConnection.onconnectionstatechange = () => {
      // Connection state tracking - not implemented  
    };

    peerConnection.oniceconnectionstatechange = () => {
        const state = peerConnection.iceConnectionState;
        if (state === "disconnected") {
          // Optional: try to recover without user action:
          peerConnection.restartIce();
        }
        if (state === "failed") {
          // eslint-disable-next-line no-console
    console.error('ICE connection failed - marking disconnected');
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
        isConnected = false;
        if (pttButton) {
          pttButton.innerText = 'Reconnect';
          pttButton.style.backgroundColor = '#888';
        }
      };

    // Set up Whisper+VAD on open
    dataChannel.onopen = async () => {
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
        } catch (err) {
            // eslint-disable-next-line no-console
    console.error(`Failed to load system prompt YAML: ${err.message}`);
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
    };

    // —————————————————————————————————————————
    // NEW: Buffer for assembling the AI turn
    let aiTranscript = '';

    // 1) Catch remote audio and wire up AI recorder
    peerConnection.ontrack = async (event) => {
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
        } catch (err) {
        // eslint-disable-next-line no-console
    console.error(`AI AudioManager init error: ${err}`);
        }
    };

    // 2) Handle all incoming events
    dataChannel.addEventListener("message", async (_e) => {
        const event = JSON.parse(_e.data);
        if (!event.timestamp) event.timestamp = new Date().toLocaleTimeString();
      
        // Relay raw events
        if (onEventCallback) onEventCallback(event);
      

        // — AI interim speech (start recorder + accumulate text + offsets) —
        if (event.type === 'response.audio_transcript.delta' && typeof event.delta === 'string') {
            if (!aiAudioMgr.isRecording) {
            aiRecordingStartTime = performance.now();
            aiWordOffsets = [];
            aiTranscript = ''; // Reset transcript for new response
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
                stopAndTranscribe(aiAudioMgr, aiTranscript.trim()).then(record => {
                    if (!record) {
                        // eslint-disable-next-line no-console
    console.error('AI stopAndTranscribe returned null record');
                        return;
                    }
                    onEventCallback({ type: 'utterance.added', record });

                // reset for next turn
                aiTranscript = '';
                aiWordOffsets = [];
                aiRecordingStartTime = null;
                })
                .catch(err => // eslint-disable-next-line no-console
    console.error(`AI transcription error: ${err}`));
            } else {
                // No recording in progress
            }
        }
      
        // — user speech done (server-VAD) — ENHANCED to prevent duplicates with mobile guards
        if (event.type === 'conversation.item.input_audio_transcription.completed') {
          const t = (event.transcript || '').trim();
          if (t) {
            const transcriptKey = `${DEVICE_TYPE}-user-${t.substring(0, 20)}-${Date.now()}`;
            
            // Send word events for real-time display (preserve fast text)
            for (const w of t.split(/\s+/)) {
              onEventCallback({
                type: 'transcript.word',
                word: w,
                speaker: 'user',
                deviceType: DEVICE_TYPE,
                transcriptKey
              });
            }

            const enhanceRecord = async (record) => {
              record.text = t; // Replace placeholder text with final transcription
              record.deviceType = DEVICE_TYPE; // Mark with device type
              
              // Ensure audioURL is available for playback
              if (record.audioBlob && !record.audioURL) {
                record.audioURL = URL.createObjectURL(record.audioBlob);
              }
              
              try {
                const { words, fullText } = await fetchWordTimings(record.audioBlob);
                record.wordTimings = words;
                record.fullText = fullText;
              } catch (err) {
                // eslint-disable-next-line no-console
    console.error(`Word timing fetch failed: ${err.message}`);
                record.wordTimings = [];
                record.fullText = t;
              }
              
              // Store and emit single enhanced record with device context
              StorageService.addUtterance(record);
              onEventCallback({ 
                type: 'utterance.added', 
                record,
                deviceType: DEVICE_TYPE,
                transcriptKey
              });
              
              // Clean up pending state
              if (pendingUserRecord === record) pendingUserRecord = null;
              pendingUserRecordPromise = null;
            };

            // Try to enhance existing pending record first
            if (pendingUserRecord) {
              enhanceRecord(pendingUserRecord).catch(err => 
                // eslint-disable-next-line no-console
    console.error(`User record enhancement error: ${err}`)
              );
            } else if (pendingUserRecordPromise) {
              pendingUserRecordPromise
                .then(record => {
                  if (record) {
                    enhanceRecord(record);
                  } else {
                    // eslint-disable-next-line no-console
    console.error('pendingUserRecordPromise resolved to null');
                  }
                })
                .catch(err => // eslint-disable-next-line no-console
    console.error(`User transcription promise error: ${err}`));
            } else {
              // Fallback: create new record if no pending record exists
              stopAndTranscribe(userAudioMgr, t)
                .then(record => {
                  if (record) enhanceRecord(record);
                })
                .catch(err => // eslint-disable-next-line no-console
    console.error(`User transcription fallback error: ${err}`));
            }
          }

          return; // swallow
        }
      
        // — handle final AI transcription completion —
        if (event.type === 'response.audio_transcript.done' && typeof event.transcript === 'string') {
          const finalTranscript = event.transcript.trim();
          
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
          // Accumulate function call arguments if needed
          if (onEventCallback) onEventCallback(event);
        }

        if (event.type === 'response.function_call_arguments.done') {
          
          try {
            const args = JSON.parse(event.arguments);
            let result = null;

            if (event.name === 'get_user_profile') {
              result = await handleGetUserProfile(args);
            } else if (event.name === 'update_user_profile') {
              result = await handleUpdateUserProfile(args);
            } else {
              // eslint-disable-next-line no-console
    console.error(`Unknown function call: ${event.name}`);
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

            dataChannel.send(JSON.stringify(functionResultEvent));

            // Create response to continue conversation
            const responseEvent = {
              type: 'response.create',
              event_id: crypto.randomUUID()
            };
            dataChannel.send(JSON.stringify(responseEvent));

          } catch (error) {
            // eslint-disable-next-line no-console
    console.error(`Function call error: ${error.message}`);
            // eslint-disable-next-line no-console
    console.error(`Error stack: ${error.stack}`);
            
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
    try {
      mobileDebug('Creating WebRTC SDP offer...');
      const offer = await peerConnection.createOffer();
      mobileDebug('Setting local SDP description...');
      await peerConnection.setLocalDescription(offer);
      mobileDebug('Local SDP description set successfully');
    } catch (sdpError) {
      mobileDebug(`SDP offer creation failed: ${sdpError.name} - ${sdpError.message}`);
      throw new Error(`SDP creation failed: ${sdpError.message}`);
    }
    
    // Exchange SDP with OpenAI server
    const baseUrl = 'https://api.openai.com/v1/realtime';
    const model = 'gpt-4o-mini-realtime-preview-2024-12-17';
    
    try {
      mobileDebug('Exchanging SDP with OpenAI server...');
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
        mobileDebug(`SDP exchange failed: ${sdpResponse.status} ${sdpResponse.statusText}`);
        mobileDebug(`Error details: ${errorText.substring(0, 100)}...`);
        throw new Error(`SDP exchange failed: ${sdpResponse.status} ${sdpResponse.statusText}`);
      }
      
      mobileDebug('SDP exchange successful, setting remote description...');
      // Set remote description
      const sdpText = await sdpResponse.text();
      const answer = {
        type: 'answer',
        sdp: sdpText
      };
      
      await peerConnection.setRemoteDescription(answer);
      mobileDebug('Remote SDP description set successfully');
    } catch (fetchError) {
      mobileDebug(`SDP exchange error: ${fetchError.name} - ${fetchError.message}`);
      throw new Error(`SDP exchange failed: ${fetchError.message}`);
    }
    
    
    // eslint-disable-next-line no-console
    console.log('OpenAI Realtime connection established');
    mobileDebug('🎉 OpenAI Realtime connection fully established!');
    isConnected = true;
    
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(`OpenAI connection error: ${error.message}`);
    // eslint-disable-next-line no-console
    console.error(`Error details:`, error);
    
    // Show specific error message for common mobile issues
    let errorText = 'Error';
    if (error.message.includes('getUserMedia') || error.message.includes('Permission')) {
      errorText = MOBILE_DEVICE ? 'Mic Access' : 'Mic Error';
    } else if (error.message.includes('SDP') || error.message.includes('WebRTC')) {
      errorText = MOBILE_DEVICE ? 'Connection' : 'WebRTC Error';
    } else if (error.message.includes('token') || error.message.includes('fetch')) {
      errorText = 'Network';
    }
    
    pttButton.innerText = errorText;
    pttButton.style.backgroundColor = '#c00';
    
    // Reset after 3 seconds with mobile-specific messaging
    setTimeout(() => {
      if (MOBILE_DEVICE && errorText === 'Mic Access') {
        pttButton.innerText = 'Allow Mic';
        // Show mobile help panel
        const mobileHelp = document.getElementById('mobileHelp');
        if (mobileHelp) {
          mobileHelp.style.display = 'block';
        }
        // eslint-disable-next-line no-console
        console.log('Mobile microphone troubleshooting: Check browser permissions, try refreshing, or use Chrome/Safari');
      } else {
        pttButton.innerText = 'Try Again';
      }
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
  } else {
    if (!audioTrack) {
      // eslint-disable-next-line no-console
    console.error('Cannot enable microphone - no audio track available');
    }
    if (!isConnected) {
      // eslint-disable-next-line no-console
    console.error('Cannot enable microphone - not connected to OpenAI');
    }
  }
}

function disableMicrophone() {
  if (audioTrack) {
    audioTrack.enabled = false;
    isMicActive = false;
    pttButton.style.backgroundColor = '#44f'; // Blue when inactive
    pttButton.innerText = 'Push to Talk';
  } else {
    // eslint-disable-next-line no-console
    console.error('Cannot disable microphone - no audio track available');
  }
}

export function sendTextMessage(text) {
  if (!dataChannel || dataChannel.readyState !== 'open') {
    // eslint-disable-next-line no-console
    console.error('Cannot send message: data channel not open');
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
  
}