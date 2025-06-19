// openaiRealtime.js - DEBUG VERSION
// This module handles WebRTC connections to OpenAI's Realtime API


import { AudioManager } from './audio/audioManager';
import { StorageService } from './core/storageService';
import jsyaml from 'js-yaml';

// Example function tools for the Realtime API
const FUNCTION_TOOLS = [{
  type: 'function',
  name: 'search_knowledge_base',
  description: 'Query a knowledge base to retrieve relevant info on a topic.',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'The user question or search query.'
      },
      options: {
        type: 'object',
        properties: {
          num_results: {
            type: 'number',
            description: 'Number of top results to return.'
          },
          domain_filter: {
            type: ['string', 'null'],
            description: "Optional domain to narrow the search (e.g. 'finance', 'medical'). Pass null if not needed."
          },
          sort_by: {
            type: ['string', 'null'],
            enum: ['relevance', 'date', 'popularity', 'alphabetical'],
            description: 'How to sort results. Pass null if not needed.'
          }
        },
        required: ['num_results', 'domain_filter', 'sort_by'],
        additionalProperties: false
      }
    },
    required: ['query', 'options'],
    additionalProperties: false
  }
}];


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
          const { words, fullText } = await fetchWordTimings(record.audioBlob);
          record.wordTimings = words;
          record.fullText    = fullText;
        } catch {
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
  pttButton.style.right = '20px';
  pttButton.style.width = '100px';
  pttButton.style.height = '100px';
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
  
  pttButton.addEventListener('touchstart', (e) => {
    debugLog('touchstart event fired');
    e.preventDefault(); // Prevent default behavior for touch events
    isPTTPressed = true;
    handlePTTPress(e);
  });
  
  pttButton.addEventListener('touchend', (e) => {
    debugLog('touchend event fired');
    e.preventDefault(); // Prevent default behavior for touch events
    isPTTPressed = false;
    handlePTTRelease(e);
  });
  
  // Optional: Add touchcancel for better mobile support
  pttButton.addEventListener('touchcancel', (e) => {
    debugLog('touchcancel event fired');
    e.preventDefault();
    isPTTPressed = false;
    handlePTTRelease(e);
  });
  
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
            tools: FUNCTION_TOOLS
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
    dataChannel.addEventListener("message", (e) => {
        const event = JSON.parse(e.data);
        debugLog(`Received event: ${event.type}`);
        if (!event.timestamp) event.timestamp = new Date().toLocaleTimeString();
      
        // Relay raw events
        if (onEventCallback) onEventCallback(event);

        // Handle function calling
        if (event.type === 'response.function_call') {
            try {
                const args = JSON.parse(event.arguments || '{}');
                let result = null;
                if (event.name === 'search_knowledge_base') {
                    // Placeholder implementation: return a simple string
                    result = `Results for ${args.query || ''}`;
                }
                if (result !== null) {
                    const responseEvent = {
                        type: 'function.response',
                        id: event.id,
                        response: JSON.stringify(result)
                    };
                    dataChannel.send(JSON.stringify(responseEvent));
                    debugLog('Sent function.response');
                }
            } catch (err) {
                debugLog(`Function call error: ${err.message}`, true);
            }
            return;
        }
      

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
            onEventCallback({
            type: 'transcript.word',
            word: event.delta,
            speaker: 'ai',
            offsetMs
            });
        }
      

        // — stop recording exactly once, at the end of the audio buffer —
        if (event.type === 'output_audio_buffer.stopped') {
            if (aiAudioMgr.isRecording) {
                debugLog("🔴 [AI] output_audio_buffer.stopped — stopping recorder");
                stopAndTranscribe(aiAudioMgr, aiTranscript.trim()).then(record => {
                    if (!record) return;
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