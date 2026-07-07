# Ticket: WebSocket transport for the OpenAI Realtime session (fallback for relay-hostile networks)

> **Status (2026-07-06): implemented, pending manual confirmation on the affected network.**
> Select with `?transport=websocket` or `localStorage.realtimeTransport = 'websocket'` (default `webrtc`).
> `npm run validate:realtime` passes connect/reconnect/audio scenarios on both transports against the live API.
> Deliberate follow-up (not built): automatic WebRTC→WS fallback.

## Summary

The realtime voice connection uses **WebRTC** (peer connection + data channel + media tracks) to talk to the OpenAI Realtime API. On some networks this can't stay connected. Add a **WebSocket transport** as an alternative path (`wss://` to OpenAI — plain TLS, no ICE/NAT/relay) so users on those networks can connect reliably. Keep WebRTC as the default; use WebSocket as a fallback or config-selectable transport.

This is a **large change** (transport layer + audio capture/playback), so it's scoped and de-risked below.

---

## Background — why this is needed

Extensive debugging (PRs #98–#104) established, with reproduction, that on at least one real user network:

- **The direct WebRTC path works but drops constantly.** It connects and carries a full conversation, then `ICE connection state: disconnected` fires during the silence between push-to-talk turns (NAT-binding timeout on the UDP path). It drops roughly every message.
- **TURN relay does not work on that network.**
  - Metered relay: unreachable on every transport (ICE candidate error `701` on UDP/TCP/TLS).
  - Cloudflare relay: *allocates* fine (24 relay candidates gathered over TLS/443, no 701s) but the relayed connectivity checks **hang `in-progress` forever and never succeed** — the network permits TLS allocation but blocks the relayed media path. Verified via in-app ICE diagnostics: `ICE diagnostics @8000ms: iceState=checking pairs=[24× "in-progress"] selected=null`, then data-channel timeout.
  - TCP/TLS-only relay URLs (`RTC_TURN_TCP_ONLY`) and bumped timeouts (15s gather / 25s data channel, PR #103) did **not** fix it.

**Conclusion:** no WebRTC/relay tuning connects on that network. But the network *does* allow ordinary HTTPS (token fetch, page load, and OpenAI's REST all work). A WebSocket to `api.openai.com` rides that same allowed HTTPS path and sidesteps ICE/NAT/relay entirely — it is the robust fix.

Mitigations already shipped (see "Current state") make WebRTC "choppy but functional" via auto-reconnect, but that is not a clean experience.

---

## Current state (already deployed, do not redo)

- `RTC_ICE_TRANSPORT_POLICY=all` on the backend (direct path preferred, TURN as fallback).
- Cloudflare TURN credentials minted per request in `backend/src/routes/rtcConfigRoute.js` (`CLOUDFLARE_TURN_KEY_ID` / `CLOUDFLARE_TURN_API_TOKEN`), plus `RTC_TURN_TCP_ONLY=true`. (Relay still helps users on *normal* networks; keep it.)
- **Auto-reconnect** on transport drop is live (PR #99, `connectionLifecycleService.js` → `handleConnectionDropped` → capped-backoff reconnect).
- Stale-transport cleanup on reconnect (PR #98).
- **Validation harness**: `npm run validate:realtime` (`shader-playground/scripts/validate-realtime.mjs`) boots backend+frontend locally, drives the app headless, and checks connect + auto-reconnect. Use it. NOTE: it runs from a healthy network, so it validates *logic/regressions*, not the network-specific failure.

---

## Goal

Add a WebSocket transport for the OpenAI Realtime session that:

1. Connects over `wss://api.openai.com/v1/realtime` using the existing ephemeral token from `GET /token`.
2. Captures mic audio (PCM16, 24 kHz) and streams it to OpenAI via `input_audio_buffer.append`, honoring the existing **push-to-talk** model (append while pressed, commit on release).
3. Receives model audio (`response.output_audio.delta`, base64 PCM16) and plays it back via the Web Audio API.
4. Preserves everything the data-channel path does today: session config, transcription, function calls, corrections/citations, token usage, interruption/`response.cancel`.
5. Works with the existing auto-reconnect state machine.
6. Is selectable — default WebRTC, WebSocket as an explicit fallback (config flag and/or automatic fallback when WebRTC fails to establish).

---

## Technical approach

### Transport selection
Introduce a transport abstraction so `session.js` can use either WebRTC or WebSocket behind one interface (send event, on event, connect, teardown, mic on/off, remote audio). Today `session.js` wires `WebRtcTransportService` + `ConnectionLifecycleService` + `DataChannelEventRouter`. The event router already parses realtime events from a channel — reuse it; the WS just becomes a different `send`/`onmessage` source feeding the same router.

### Auth (CONFIRM against current OpenAI docs first)
Browsers can't set WebSocket headers, so the ephemeral key is passed via **subprotocols**, historically:
`['realtime', 'openai-insecure-api-key.<EPHEMERAL_KEY>', 'openai-beta.realtime-v1']`.
The ephemeral key is what `GET /token` already returns (`data.value` / `data.client_secret.value`). **Verify the exact URL, model query param, subprotocol format, and event names against the current Realtime docs** — the API has GA'd and names may differ from the WebRTC path (e.g. `response.output_audio.delta` vs older `response.audio.delta`). Model/voice today: `gpt-realtime-1.5` / `marin` (backend `server.js`).

### Audio pipeline (the bulk of the work)
WebRTC handled audio via media tracks; WebSocket requires manual audio:
- **Capture:** `getUserMedia` → `AudioContext` + `AudioWorkletNode` (or ScriptProcessor fallback) to get raw PCM, downsample to 24 kHz mono PCM16, base64-encode, send as `input_audio_buffer.append`. On PTT release, `input_audio_buffer.commit` (+ `response.create` if not using server VAD).
- **Playback:** collect `response.output_audio.delta` base64 PCM16 → decode → schedule into an `AudioContext` output queue (jitter buffer). Reuse/extend the existing `AudioManager` / `remoteAudioStreamService` concepts where possible.
- Note: WebRTC's built-in echo cancellation / jitter buffering are lost; rely on `getUserMedia` constraints (echoCancellation/noiseSuppression) and a small playback buffer.

### Reconnect
Route WS `close`/`error` through the same `handleConnectionDropped` path so auto-reconnect works uniformly. WS reconnect is simpler (no ICE) — a fresh token + new socket.

---

## Key files

- `shader-playground/src/realtime/session.js` — orchestrator; wires transport, audio, event router.
- `shader-playground/src/realtime/webrtcTransportService.js` — current WebRTC establish flow (POSTs offer SDP to `https://api.openai.com/v1/realtime/calls`). Model for the new WS transport service.
- `shader-playground/src/realtime/connectionLifecycleService.js` — connect flow, data-channel wait, session config, auto-reconnect (`handleConnectionDropped`, backoff).
- `shader-playground/src/realtime/dataChannelEventRouter.js` — parses/dispatches realtime events; reuse for WS messages.
- `shader-playground/src/realtime/sessionConfigurationBuilder.js` — `session.update` payload.
- `shader-playground/src/realtime/connectionBootstrapService.js` — `GET /token`, `GET /rtc-config`.
- `shader-playground/src/realtime/pttOrchestrator.js` — push-to-talk press/release logic.
- `shader-playground/src/audio/audioManager.js`, `remoteAudioStreamService.js` — audio capture/playback.
- Backend: `backend/src/routes/tokenRoute.js` (ephemeral key), `backend/server.js` (model/voice).

---

## Acceptance criteria

- A config flag selects transport (`webrtc` default, `websocket` fallback), and/or WebSocket is used automatically when WebRTC fails to establish within the timeout.
- Over WebSocket: connect succeeds; PTT press→speak→release produces a model audio response that plays back; user + assistant transcripts and function calls/corrections still work; token usage still tracked.
- Auto-reconnect works over WebSocket (drop the socket → it re-establishes with no user input).
- No regression to the WebRTC path.
- `npm run validate:realtime` passes for both transports (extend the harness with a `--transport=websocket` scenario). Add unit tests for the new transport service mirroring `webrtc-transport-service.test.js`.
- Manual confirmation on the affected network (human-in-the-loop) that WebSocket connects where WebRTC relay could not.

---

## Validation

- Extend `shader-playground/scripts/validate-realtime.mjs` with a websocket transport scenario.
- Unit-test the WS transport service (mock the socket) like the existing WebRTC/ lifecycle tests.
- Backend module tests: `cd backend && node --test tests/modules/*.test.mjs`. Frontend: `cd shader-playground && npx vitest run`.

---

## Risks / open questions

- **Confirm current browser WS auth** for the Realtime API (subprotocol format, whether ephemeral keys are accepted over WS, exact URL/model param). This is the top risk — validate before building the audio layer.
- Audio quality without WebRTC's DSP (echo, jitter) — may need tuning.
- Latency: WS audio is typically a bit higher than WebRTC media; acceptable for this use case.
- Decide fallback trigger: manual flag first (simpler); automatic WebRTC→WS fallback is a nice follow-up.

## Out of scope

- Replacing WebRTC entirely (keep it as the default/low-latency path).
- Changing the relay/TURN config (already done).
