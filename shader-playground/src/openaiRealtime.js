// openaiRealtime.js
// Thin facade that wires UI controls to the RealtimeSession engine.

import { RealtimeSession } from './realtime/session.js';
import { isMobileDevice, createMobileDebug } from './utils/mobile.js';

const MOBILE_DEVICE = isMobileDevice();
const DEVICE_TYPE = MOBILE_DEVICE ? 'mobile' : 'desktop';
const mobileDebug = createMobileDebug(MOBILE_DEVICE);

const session = new RealtimeSession({
  apiUrl: __API_URL__,
  mobileDebug,
  deviceType: DEVICE_TYPE
});

let pttButton = null;
let isPTTPressed = false;
let isFirstConnectionPress = true;
let lastTouchEventTime = 0;
let touchEventCount = 0;
const MOBILE_DEBOUNCE_TIME = MOBILE_DEVICE ? 100 : 0;
const CONNECTING_FEEDBACK_MS = 1200;

export async function initOpenAIRealtime(streamCallback, eventCallback, usageCallback = null) {
  if (MOBILE_DEVICE) {
    mobileDebug('Initializing OpenAI Realtime for mobile device');
  }

  await session.init({
    onRemoteStream: streamCallback,
    onEvent: eventCallback,
    onTokenUsage: usageCallback
  });

  ensurePTTButton();
  return true;
}

function ensurePTTButton() {
  if (pttButton) {
    session.attachPTTButton(pttButton);
    return;
  }

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
  pttButton.style.backgroundColor = '#44f';
  pttButton.style.color = 'white';
  pttButton.style.border = 'none';
  pttButton.style.boxShadow = '0 4px 10px rgba(0,0,0,0.5)';
  pttButton.style.cursor = 'pointer';
  pttButton.style.zIndex = '1001';
  pttButton.style.fontSize = '16px';
  pttButton.style.fontWeight = 'bold';
  pttButton.style.fontFamily = 'Arial, sans-serif';

  session.attachPTTButton(pttButton);
  attachEventListeners();
  document.body.appendChild(pttButton);
}

async function attemptPTTStart() {
  const result = await session.handlePTTPress();
  if (!result.allowed) {
    if (result.reason === 'token_limit_exceeded') {
      showTokenLimitMessage();
    } else if (result.reason === 'connecting' && pttButton) {
      pttButton.innerText = 'Connecting...';
      pttButton.style.backgroundColor = '#666';
      setTimeout(() => {
        if (!isPTTPressed && pttButton) {
          pttButton.innerText = 'Push to Talk';
          pttButton.style.backgroundColor = '#44f';
        }
      }, CONNECTING_FEEDBACK_MS);
    }
    return false;
  }
  return true;
}

async function connectOnly() {
  if (session.isConnectedToOpenAI()) {
    isFirstConnectionPress = false;
    return false;
  }

  if (pttButton) {
    pttButton.innerText = 'Connecting...';
    pttButton.style.backgroundColor = '#666';
  }

  try {
    await session.connect();
    isFirstConnectionPress = false;
  } catch (err) {
    return false;
  } finally {
    isPTTPressed = false;
    if (pttButton) {
      pttButton.innerText = 'Push to Talk';
      pttButton.style.backgroundColor = '#44f';
    }
  }
  return false;
}

async function startPTT() {
  if (isPTTPressed) return;

  if (isFirstConnectionPress) {
    await connectOnly();
    return;
  }

  const started = await attemptPTTStart();
  if (started) {
    isPTTPressed = true;
  }
}

function finishPTT() {
  if (!isPTTPressed) return;
  isPTTPressed = false;
  session.handlePTTRelease({
    bufferTime: MOBILE_DEVICE ? 1000 : 500
  });
}

const handleMouseDown = async (e) => {
  if (e) e.preventDefault();
  await startPTT();
};

const handleMouseUp = () => {
  finishPTT();
};

const handleTouchStart = async (e) => {
  const now = Date.now();
  touchEventCount++;

  if (MOBILE_DEVICE && (now - lastTouchEventTime) < MOBILE_DEBOUNCE_TIME) {
    e.preventDefault();
    return;
  }

  lastTouchEventTime = now;
  e.preventDefault();
  if (isPTTPressed) return;
  await startPTT();
};

const handleTouchMove = (e) => {
  if (isPTTPressed) {
    e.preventDefault();
  }
};

const handleTouchEnd = (e) => {
  e.preventDefault();
  finishPTT();
};

function attachEventListeners() {
  pttButton.addEventListener('mousedown', handleMouseDown);
  document.addEventListener('mouseup', handleMouseUp);
  pttButton.addEventListener('touchstart', handleTouchStart, { passive: false });
  pttButton.addEventListener('touchmove', handleTouchMove, { passive: false });
  pttButton.addEventListener('touchend', handleTouchEnd, { passive: false });
  pttButton.addEventListener('touchcancel', handleTouchEnd, { passive: false });
}

function detachEventListeners() {
  if (!pttButton) return;
  pttButton.removeEventListener('mousedown', handleMouseDown);
  document.removeEventListener('mouseup', handleMouseUp);
  pttButton.removeEventListener('touchstart', handleTouchStart);
  pttButton.removeEventListener('touchmove', handleTouchMove);
  pttButton.removeEventListener('touchend', handleTouchEnd);
  pttButton.removeEventListener('touchcancel', handleTouchEnd);
}

export function sendTextMessage(text) {
  return session.sendTextMessage(text);
}

export function isConnectedToOpenAI() {
  return session.isConnectedToOpenAI();
}

export function cleanup() {
  session.cleanup();
  detachEventListeners();
  if (pttButton && pttButton.parentNode) {
    pttButton.parentNode.removeChild(pttButton);
  }
  pttButton = null;
  isPTTPressed = false;
  isFirstConnectionPress = true;
  lastTouchEventTime = 0;
  touchEventCount = 0;
}

// Show token limit reached message (copied from previous implementation)
function showTokenLimitMessage() {
  let limitOverlay = document.getElementById('token-limit-overlay');

  if (!limitOverlay) {
    limitOverlay = document.createElement('div');
    limitOverlay.id = 'token-limit-overlay';
    limitOverlay.innerHTML = `
      <div class="token-limit-modal">
        <div class="token-limit-content">
          <h2>TOKEN LIMIT REACHED</h2>
          <p>You've reached the token limit for this session.</p>
          <p>Please refresh the page to start a new conversation.</p>
          <button onclick="window.location.reload()" class="token-limit-refresh-btn">
            REFRESH PAGE
          </button>
        </div>
      </div>
    `;

    const style = document.createElement('style');
    style.textContent = `
      #token-limit-overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.8);
        z-index: 10000;
        display: flex;
        align-items: center;
        justify-content: center;
        font-family: 'DM Mono', 'Courier New', monospace;
      }

      .token-limit-modal {
        background: linear-gradient(145deg, #1a1a1a 0%, #0d0d0d 100%);
        border: 2px solid #ff0040;
        border-radius: 12px;
        padding: 30px;
        max-width: 400px;
        text-align: center;
        box-shadow:
          0 0 20px rgba(255, 0, 64, 0.5),
          inset 0 0 20px rgba(255, 0, 64, 0.1);
      }

      .token-limit-content h2 {
        color: #ff0040;
        font-size: 24px;
        margin: 0 0 20px 0;
        text-shadow: 0 0 10px rgba(255, 0, 64, 0.5);
        animation: tokenLimitPulse 1s infinite alternate;
      }

      .token-limit-content p {
        color: #ffffff;
        font-size: 14px;
        line-height: 1.5;
        margin: 10px 0;
      }

      .token-limit-refresh-btn {
        background: linear-gradient(145deg, #ff0040 0%, #cc0033 100%);
        color: white;
        border: none;
        padding: 12px 24px;
        font-size: 16px;
        font-weight: bold;
        border-radius: 6px;
        cursor: pointer;
        margin-top: 20px;
        font-family: 'DM Mono', 'Courier New', monospace;
        box-shadow: 0 4px 15px rgba(255, 0, 64, 0.3);
        transition: all 0.3s ease;
      }

      .token-limit-refresh-btn:hover {
        background: linear-gradient(145deg, #ff3366 0%, #ff0040 100%);
        box-shadow: 0 6px 20px rgba(255, 0, 64, 0.5);
        transform: translateY(-2px);
      }

      @keyframes tokenLimitPulse {
        0% { opacity: 0.8; }
        100% { opacity: 1; }
      }
    `;

    document.head.appendChild(style);
    document.body.appendChild(limitOverlay);
  }

  limitOverlay.style.display = 'flex';
}
