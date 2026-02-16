import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { BubbleManager } from '../../src/ui/bubbleManager.js';
import { RealtimeEventCoordinator } from '../../src/realtime/realtimeEventCoordinator.js';
import { DataChannelEventRouter } from '../../src/realtime/dataChannelEventRouter.js';

describe('PTT interrupt path (integration)', () => {
  let dom;
  let container;
  let bubbleManager;
  let coordinator;
  let router;
  let streamingTranscript;
  let aiAudioMgr;

  beforeEach(() => {
    vi.useFakeTimers();
    dom = new JSDOM('<!doctype html><html><body><div id="transcriptContainer"></div></body></html>', {
      url: 'http://localhost'
    });
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    Object.defineProperty(globalThis, 'navigator', {
      value: dom.window.navigator,
      configurable: true,
      writable: true
    });

    container = document.getElementById('transcriptContainer');
    bubbleManager = new BubbleManager({
      containerElement: container,
      isMobile: false
    });

    streamingTranscript = '';
    coordinator = new RealtimeEventCoordinator({
      bubbleManager,
      retrievalCoordinator: {
        appendStreamingDelta: (delta) => {
          streamingTranscript += delta;
          return streamingTranscript;
        },
        handleFinalTranscript: (value) => value,
        handleToolSearchResult: () => null,
        handleToolSearchStarted: () => {},
        resetStreamingTranscript: () => {
          streamingTranscript = '';
        }
      },
      addWord: () => {},
      playAudioFor: () => {},
      usedWords: new Set()
    });
    coordinator.setUtteranceEventProcessor({
      handleUtteranceAdded: () => {},
      handleOutputAudioStopped: () => {}
    });

    aiAudioMgr = {
      isRecording: false,
      startRecording: () => {
        aiAudioMgr.isRecording = true;
      },
      stopRecording: async () => {
        aiAudioMgr.isRecording = false;
        return { id: 'ai-stop' };
      }
    };

    router = new DataChannelEventRouter({
      aiAudioMgr,
      getAiAudioReady: () => true,
      updateTokenUsageEstimate: () => {},
      updateTokenUsageActual: () => {},
      stopAndTranscribe: async () => ({ id: 'ai-final' }),
      handleUserTranscription: async () => {},
      handleFunctionCall: async () => {},
      onEvent: (event) => coordinator.handleEvent(event),
      now: () => 1000
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
    delete globalThis.window;
    delete globalThis.document;
    delete globalThis.navigator;
  });

  it('drops stale post-interrupt deltas and starts a fresh AI bubble for the next response', async () => {
    await router.handleMessage({
      data: JSON.stringify({ type: 'response.audio_transcript.delta', delta: 'First answer.' })
    });

    expect(container.querySelectorAll('.bubble.ai')).toHaveLength(1);
    const firstBubble = container.querySelector('.bubble.ai .highlighted-text');
    expect(firstBubble.textContent).toContain('First answer.');

    router.abortAiTurnCapture({ interruptedUtteranceId: 'interrupted-1' });
    coordinator.handleEvent({ type: 'assistant.interrupted', utteranceId: 'interrupted-1' });
    vi.advanceTimersByTime(0);

    await router.handleMessage({
      data: JSON.stringify({ type: 'response.audio_transcript.delta', delta: ' stale tail' })
    });
    expect(container.querySelectorAll('.bubble.ai')).toHaveLength(1);
    expect(firstBubble.textContent).not.toContain('stale tail');

    await router.handleMessage({
      data: JSON.stringify({ type: 'output_audio_buffer.stopped' })
    });
    await router.handleMessage({
      data: JSON.stringify({ type: 'response.audio_transcript.delta', delta: 'Second answer.' })
    });

    const aiBubbles = container.querySelectorAll('.bubble.ai .highlighted-text');
    expect(aiBubbles).toHaveLength(2);
    expect(aiBubbles[0].textContent).toContain('First answer.');
    expect(aiBubbles[0].textContent).not.toContain('Second answer.');
    expect(aiBubbles[1].textContent).toContain('Second answer.');
  });
});
