# Frontend Realtime Session

## Scope

This doc covers PTT/WebRTC/data-channel/session logic under:
- `shader-playground/src/openaiRealtime.js`
- `shader-playground/src/realtime/session.js`

## Layering

- `openaiRealtime.js` is a UI facade:
  - creates/owns PTT button,
  - enforces first-press connect-only behavior,
  - delegates all session logic to `RealtimeSession`.
- `session.js` is now a composition root around focused services.

## Service Map Inside `RealtimeSession`

- Connection bootstrap: `connectionBootstrapService.js`
- WebRTC transport (offer/answer + data channel): `webrtcTransportService.js`
- Connection lifecycle orchestration: `connectionLifecycleService.js`
- Connection state machine: `sessionConnectionState.js`
- PTT behavior: `pttOrchestrator.js`
- Data channel event routing: `dataChannelEventRouter.js`
- Remote audio track handling: `remoteAudioStreamService.js`
- Session update payload/tools schema: `sessionConfigurationBuilder.js`
- System prompt fetch/send: `systemPromptService.js`
- Function call dispatch: `functionCallService.js`
- Retrieval proxy client: `knowledgeSearchService.js`
- Token usage batching/posting: `tokenUsageTracker.js`
- Token limit preflight: `tokenLimitService.js`
- Transcription enrichment:
  - user: `userTranscriptionService.js`
  - generic stop/transcribe: `utteranceTranscriptionService.js`
- Connect error UX mapping: `connectionErrorPresenter.js`
- Outbound text messages: `outboundMessageService.js`

## Connection Lifecycle

State machine (`SessionConnectionState`):
- `idle`
- `connecting`
- `connected`
- `reconnecting`
- `failed`

Key transitions:
- connect request -> `connecting`
- successful peer establishment -> `connected`
- data-channel close or ICE disconnected -> `reconnecting`
- connect/ICE failure -> `failed`
- cleanup -> `idle`

## PTT Press/Release Contract

Press (`PttOrchestrator.handlePTTPress`):
1. reject if connecting,
2. token-limit precheck,
3. connect if needed,
4. wait for data channel open,
5. send `response.cancel` and `input_audio_buffer.clear`,
6. emit `assistant.interrupted`,
7. start user recording and mic enable.

Release (`PttOrchestrator.handlePTTRelease`):
1. stop local user recording into pending record promise,
2. after buffer delay, disable mic,
3. emit speech stopped,
4. send `input_audio_buffer.commit` and `response.create`.

## Interruption Hardening

`DataChannelEventRouter` interruption behavior:
- on interrupt, finalize partial AI capture when possible,
- suppress stale assistant transcript/audio events after cancel,
- clear suppression on drain signal (`output_audio_buffer.stopped` or `response.done`) or timeout.

`RealtimeEventCoordinator` interruption behavior:
- force close current AI bubble with synthetic interrupted utterance id,
- clear pending response-text mode/buffer,
- reset citation streaming state to prevent stale text carry-over.

## Data Channel Routing Contract

`DataChannelEventRouter.handleMessage(...)` routes:
- transcript deltas/done,
- output audio start/stop,
- user transcription completed,
- function call payloads,
- token usage updates from `response.done` / `session.updated`.

It also owns AI recording capture lifecycle (`aiAudioMgr`) and emits `utterance.added` after stop/transcribe.

## Remote Audio Attach Race Mitigation

`RemoteAudioStreamService` handles both:
- future `peerConnection.ontrack` events,
- already-live receiver tracks via `getReceivers()` hydration.

This prevents missing AI audio when track arrival races handler setup.

## Key Tests

- `shader-playground/src/tests/realtime/ptt-orchestrator.test.js`
- `shader-playground/src/tests/realtime/data-channel-event-router.test.js`
- `shader-playground/src/tests/realtime/connection-lifecycle-service.test.js`
- `shader-playground/src/tests/realtime/session-connection-state.test.js`
- `shader-playground/src/tests/realtime/remote-audio-stream-service.test.js`
- `shader-playground/tests/integration/ptt-interrupt-path.integration.test.js`
- `shader-playground/tests/integration/reconnect-ptt-path.integration.test.js`
- Flow diagram: `shader-playground/docs/push_to_talk_flow.mmd`
