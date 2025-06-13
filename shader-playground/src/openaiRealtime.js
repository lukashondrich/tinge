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

// Minimal logger to follow the event flow
function log(message) {
  console.log(`[realtime] ${message}`);
}

// our recorder for “utterance” blobs
const userAudioMgr = new AudioManager({ speaker: 'user' });
const aiAudioMgr = new AudioManager({ speaker: 'ai' });

export async function initOpenAIRealtime(streamCallback, eventCallback) {
  
  // Store the callback for later use
  onRemoteStreamCallback = streamCallback;
  onEventCallback = eventCallback;
  log('init realtime');

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
  
  pttButton.onclick = () => {};
  
  // Add event listeners for PTT button
  pttButton.addEventListener('mousedown', (e) => {
    isPTTPressed = true;
    handlePTTPress(e);
  });
  
  // Listen for mouseup on the document to catch releases outside the button
  document.addEventListener('mouseup', (e) => {
    if (isPTTPressed) {
      isPTTPressed = false;
      handlePTTRelease(e);
    }
  });
  
  pttButton.addEventListener('touchstart', (e) => {
    e.preventDefault();
    isPTTPressed = true;
    handlePTTPress(e);
  });
  
  pttButton.addEventListener('touchend', (e) => {
    e.preventDefault();
    isPTTPressed = false;
    handlePTTRelease(e);
  });
  
  // Optional: Add touchcancel for better mobile support
  pttButton.addEventListener('touchcancel', (e) => {
    e.preventDefault();
    isPTTPressed = false;
    handlePTTRelease(e);
  });
  
  document.body.appendChild(pttButton);
}

async function handlePTTPress(e) {
  log('ptt down');

  pendingUserRecordPromise = null;
  pendingUserRecord = null;
  
  // Connect if not already connected
  if (!isConnected) {
    try {
      log('connect');
      await connect();
      // Don't enable mic yet if we're still connecting
      if (!isConnected) {
        return;
      }
    } catch (error) {
      log(`connect failed: ${error.message}`);
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
  log('ptt up');
  disableMicrophone();

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
      .catch(err => log(`user stop error: ${err}`));
  }

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
    }
  }
}

export async function connect() {
    try {
    log('connect start');
    pttButton.innerText = 'Connecting...';
    pttButton.style.backgroundColor = '#666';

    // Get token
    log('requesting token');
    const tokenResponse = await fetch('/token');
    if (!tokenResponse.ok) throw new Error(`Failed to get token: ${tokenResponse.status}`);
    const data = await tokenResponse.json();
    const EPHEMERAL_KEY = data.client_secret.value;

    // Create PeerConnection
    peerConnection = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
    peerConnection.addTransceiver("audio", { direction: "sendrecv" });

    peerConnection.oniceconnectionstatechange = () => {
        const state = peerConnection.iceConnectionState;
        if (state === "disconnected") {
          // Optional: try to recover without user action:
          peerConnection.restartIce();
        }
        if (state === "failed") {
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
            log(`system prompt load failed: ${err.message}`);
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
            } : null
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
        log(`AI AudioManager init error: ${err}`);
        }
    };

    // 2) Handle all incoming events
    dataChannel.addEventListener("message", (e) => {
        const event = JSON.parse(e.data);
        log(`event: ${event.type}`);
        if (!event.timestamp) event.timestamp = new Date().toLocaleTimeString();
      
        // Relay raw events
        if (onEventCallback) onEventCallback(event);
      

        // — AI interim speech (start recorder + accumulate text + offsets) —
        if (event.type === 'response.audio_transcript.delta' && typeof event.delta === 'string') {
            if (!aiAudioMgr.isRecording) {
            aiRecordingStartTime = performance.now();
            aiWordOffsets = [];
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
                stopAndTranscribe(aiAudioMgr, aiTranscript.trim()).then(record => {
                    if (!record) return;
                    onEventCallback({ type: 'utterance.added', record });

                // reset for next turn
                aiTranscript = '';
                aiWordOffsets = [];
                aiRecordingStartTime = null;
                })
                .catch(err => log(`AI transcription error: ${err}`));
            } else {
            log('AI buffer-stopped but was not recording');
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
                .catch(err => log(`user transcription error: ${err}`));
            } else {
              stopAndTranscribe(userAudioMgr, t)
                .then(record => {
                  if (record) finalize(record);
                })
                .catch(err => log(`user transcription error: ${err}`));
            }
          }

          return; // swallow
        }
      
        // — drop the old “response.done” or “response.audio_transcript.done” blocks entirely —
      });
      
  

    
    
    // Create and set local description
    log('creating offer');
    try {
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      log('local desc set');
    } catch (sdpError) {
      log(`offer error: ${sdpError.message}`);
      throw new Error(`SDP creation failed: ${sdpError.message}`);
    }
    
    // Exchange SDP with OpenAI server
    log('exchange sdp');
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
      }
      
      // Set remote description
      const sdpText = await sdpResponse.text();
      log('sdp received');
      const answer = {
        type: 'answer',
        sdp: sdpText
      };
      
      await peerConnection.setRemoteDescription(answer);
      log('remote desc set');
    } catch (fetchError) {
      log(`sdp error: ${fetchError.message}`);
    }
    
    
    log('connected');
    isConnected = true;
    
  } catch (error) {
    log(`connection error: ${error.message}`);
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
    log('mic on');
  } else {
    if (!audioTrack) {
    }
    if (!isConnected) {
    }
  }
}

function disableMicrophone() {
  if (audioTrack) {
    audioTrack.enabled = false;
    isMicActive = false;
    pttButton.style.backgroundColor = '#44f'; // Blue when inactive
    pttButton.innerText = 'Push to Talk';
    log('mic off');
  } else {
  }
}

export function sendTextMessage(text) {
  if (!dataChannel || dataChannel.readyState !== 'open') {
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
  log(`sent text: ${text}`);
  
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
  
  log('cleanup');
}