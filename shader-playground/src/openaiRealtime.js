// openaiRealtime.js - DEBUG VERSION
// This module handles WebRTC connections to OpenAI's Realtime API

let peerConnection = null;
let dataChannel = null;
let audioTrack = null;
let isMicActive = false;
let isConnected = false;
let pttButton = null;
let onRemoteStreamCallback = null;
let onEventCallback = null;

// Debug logging function
function debugLog(message, error = false) {
  const prefix = error ? '❌ ERROR:' : '🔍 DEBUG:';
  console.log(`${prefix} ${message}`);
  
  // Also display visual debug messages on the page
  const debugContainer = document.getElementById('debug-container') || createDebugContainer();
  const entry = document.createElement('div');
  entry.textContent = `${new Date().toLocaleTimeString()}: ${message}`;
  if (error) entry.style.color = 'red';
  debugContainer.appendChild(entry);
  debugContainer.scrollTop = debugContainer.scrollHeight;
}

// Create a container for debug messages
function createDebugContainer() {
  const container = document.createElement('div');
  container.id = 'debug-container';
  container.style.position = 'fixed';
  container.style.left = '10px';
  container.style.top = '10px';
  container.style.width = '300px';
  container.style.height = '200px';
  container.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
  container.style.color = 'white';
  container.style.padding = '10px';
  container.style.overflow = 'auto';
  container.style.fontFamily = 'monospace';
  container.style.fontSize = '12px';
  container.style.zIndex = '1000';
  container.style.borderRadius = '5px';
  document.body.appendChild(container);
  return container;
}

export async function initOpenAIRealtime(streamCallback, eventCallback) {
  
  // Store the callback for later use
  onRemoteStreamCallback = streamCallback;
  onEventCallback = eventCallback;
  debugLog("Initializing OpenAI Realtime...");

  // Create PTT button
  createPTTButton();
  
  // The actual connection will happen when the button is first pressed
  return true;
}

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
  
  // Add event listeners
  pttButton.addEventListener('mousedown', (e) => {
    debugLog('mousedown event fired');
    handlePTTPress(e);
  });
  
  pttButton.addEventListener('mouseup', (e) => {
    debugLog('mouseup event fired');
    handlePTTRelease(e);
  });
  
  pttButton.addEventListener('mouseleave', (e) => {
    debugLog('mouseleave event fired');
    handlePTTRelease(e);
  });
  
  pttButton.addEventListener('touchstart', (e) => {
    debugLog('touchstart event fired');
    e.preventDefault(); // Prevent default behavior for touch events
    handlePTTPress(e);
  });
  
  pttButton.addEventListener('touchend', (e) => {
    debugLog('touchend event fired');
    e.preventDefault(); // Prevent default behavior for touch events
    handlePTTRelease(e);
  });
  
  document.body.appendChild(pttButton);
  debugLog('PTT button created and added to document body');
}

async function handlePTTPress(e) {
  debugLog('PTT button pressed handler called');
  
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
  
  enableMicrophone();
}

function handlePTTRelease(e) {
  debugLog('PTT button released handler called');
  disableMicrophone();
}

async function connect() {
  try {
    debugLog('Connecting to OpenAI Realtime API...');
    pttButton.innerText = 'Connecting...';
    pttButton.style.backgroundColor = '#666';
    
    // Get token from server
    debugLog('Requesting token from server...');
    const tokenResponse = await fetch('/token');
    
    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      debugLog(`Failed to get token: ${tokenResponse.status} ${tokenResponse.statusText}`, true);
      debugLog(`Error details: ${errorText}`, true);
      throw new Error(`Failed to get token: ${tokenResponse.status} ${tokenResponse.statusText}`);
    }
    
    const data = await tokenResponse.json();
    if (!data.client_secret || !data.client_secret.value) {
      debugLog('Invalid token response from server - missing client_secret', true);
      debugLog(`Response data: ${JSON.stringify(data)}`, true);
      throw new Error('Invalid token response from server');
    }
    
    debugLog('Token received successfully');
    const EPHEMERAL_KEY = data.client_secret.value;
    
    // Create WebRTC peer connection
    // configure STUN/ICE and log states
    peerConnection = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
    });
    
    // make sure we negotiate both sending and receiving audio
    peerConnection.addTransceiver("audio", { direction: "sendrecv" });
    
    // debug ICE progress
    peerConnection.onicecandidate = (e) => {
        debugLog("ICE candidate: " + JSON.stringify(e.candidate));
    };
    peerConnection.oniceconnectionstatechange = () => {
        debugLog("ICE connection state: " + peerConnection.iceConnectionState);
    };
    peerConnection.onconnectionstatechange = () => {
        debugLog("Overall connection state: " + peerConnection.connectionState);
    };
    
    // ensure we catch the remote track when it arrives
    peerConnection.ontrack = (event) => {
        debugLog("✅ Remote track received from OpenAI");
        if (onRemoteStreamCallback) onRemoteStreamCallback(event.streams[0]);
    };
  
    debugLog('WebRTC peer connection created');
    
    // Request microphone access
    debugLog('Requesting microphone access...');
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: true
      });
      
      debugLog('Microphone access granted');
      
      // Store audio track and disable it initially
      audioTrack = mediaStream.getTracks()[0];
      audioTrack.enabled = false; // Start with microphone disabled
      debugLog('Audio track obtained and initially disabled');
      
      // Add the track to peer connection
      peerConnection.addTrack(audioTrack);
      debugLog('Audio track added to peer connection');
    } catch (micError) {
      debugLog(`Microphone access error: ${micError.message}`, true);
      throw new Error(`Microphone access denied: ${micError.message}`);
    }
    
    // Set up data channel
    dataChannel = peerConnection.createDataChannel('oai-events');
    debugLog('Data channel created');
    
    dataChannel.onopen = () => {
      debugLog('Data channel opened');
      isConnected = true;
      pttButton.innerText = 'Push to Talk';
      pttButton.style.backgroundColor = '#44f';
    };
    
    dataChannel.onclose = () => {
      debugLog('Data channel closed');
      isConnected = false;
      pttButton.innerText = 'Reconnect';
      pttButton.style.backgroundColor = '#888';
    };
    
    dataChannel.onerror = (error) => {
      debugLog(`Data channel error: ${error}`, true);
    };
    
    
    dataChannel.addEventListener("message", (e) => {
        const event = JSON.parse(e.data);
        debugLog(`Received event: ${event.type}`);
        if (!event.timestamp) event.timestamp = new Date().toLocaleTimeString();
      
        // And forward to your external callback, if provided:
        if (onEventCallback) {
          onEventCallback(event);
        }
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
    
    // Set up audio from OpenAI
    peerConnection.ontrack = (event) => {
      debugLog('Remote track received from OpenAI');
      
      // If there's a callback, use it
      if (onRemoteStreamCallback) {
        debugLog('Calling stream callback with remote stream');
        onRemoteStreamCallback(event.streams[0]);
      } else {
        // Default handling - create an audio element
        debugLog('No callback provided, creating audio element');
        const remoteAudio = document.createElement('audio');
        remoteAudio.srcObject = event.streams[0];
        remoteAudio.autoplay = true;
        document.body.appendChild(remoteAudio);
      }
    };
    
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