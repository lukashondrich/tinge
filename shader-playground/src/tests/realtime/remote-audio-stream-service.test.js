import { describe, it, expect, vi } from 'vitest';
import { RemoteAudioStreamService } from '../../realtime/remoteAudioStreamService.js';

describe('RemoteAudioStreamService', () => {
  function createService(overrides = {}) {
    const defaultAiAudioMgr = {
      stream: null,
      init: vi.fn(async () => {}),
      isRecording: false
    };
    const defaultDataChannelEventRouter = {
      resetAiAudioWarning: vi.fn()
    };
    const defaultOnRemoteStream = vi.fn();
    const defaultSetAiAudioReady = vi.fn();
    const defaultCreateMediaStream = vi.fn((tracks) => ({
      kind: 'media-stream',
      getAudioTracks: () => tracks
    }));
    const defaultCreateAudioElement = vi.fn(() => ({}));
    const defaultAppendElement = vi.fn();
    const defaultLog = vi.fn();
    const defaultError = vi.fn();

    const config = {
      aiAudioMgr: defaultAiAudioMgr,
      dataChannelEventRouter: defaultDataChannelEventRouter,
      onRemoteStream: defaultOnRemoteStream,
      setAiAudioReady: defaultSetAiAudioReady,
      createMediaStream: defaultCreateMediaStream,
      createAudioElement: defaultCreateAudioElement,
      appendElement: defaultAppendElement,
      log: defaultLog,
      error: defaultError,
      ...overrides
    };

    const service = new RemoteAudioStreamService({
      aiAudioMgr: config.aiAudioMgr,
      dataChannelEventRouter: config.dataChannelEventRouter,
      getOnRemoteStreamCallback: config.getOnRemoteStreamCallback || (() => config.onRemoteStream),
      setAiAudioReady: config.setAiAudioReady,
      createMediaStream: config.createMediaStream,
      createAudioElement: config.createAudioElement,
      appendElement: config.appendElement,
      log: config.log,
      error: config.error
    });

    return {
      service,
      aiAudioMgr: config.aiAudioMgr,
      dataChannelEventRouter: config.dataChannelEventRouter,
      onRemoteStream: config.onRemoteStream,
      setAiAudioReady: config.setAiAudioReady,
      createMediaStream: config.createMediaStream,
      createAudioElement: config.createAudioElement,
      appendElement: config.appendElement,
      log: config.log,
      error: config.error
    };
  }

  it('wires peer ontrack and initializes AI audio recorder', async () => {
    const ctx = createService();
    const peerConnection = {};
    const track = { id: 'track_1' };
    const remoteStream = { getAudioTracks: () => [track] };

    ctx.service.setupPeerTrackHandling(peerConnection);
    await peerConnection.ontrack({ streams: [remoteStream] });

    expect(ctx.onRemoteStream).toHaveBeenCalledWith(remoteStream);
    expect(ctx.aiAudioMgr.stream).toBe(remoteStream);
    expect(ctx.aiAudioMgr.init).toHaveBeenCalledTimes(1);
    expect(ctx.setAiAudioReady).toHaveBeenCalledWith(true);
    expect(ctx.dataChannelEventRouter.resetAiAudioWarning).toHaveBeenCalledTimes(1);
    expect(ctx.log).toHaveBeenCalledWith('AI audio recorder attached to remote stream');
  });

  it('deduplicates repeated remote tracks by track id', async () => {
    const ctx = createService();
    const track = { id: 'dup_track' };
    const remoteStream = { getAudioTracks: () => [track] };

    const firstHandled = await ctx.service.handleIncomingRemoteStream(remoteStream);
    const secondHandled = await ctx.service.handleIncomingRemoteStream(remoteStream);

    expect(firstHandled).toBe(true);
    expect(secondHandled).toBe(false);
    expect(ctx.aiAudioMgr.init).toHaveBeenCalledTimes(1);
  });

  it('falls back to creating a remote audio element when callback is missing', async () => {
    const remoteAudio = {};
    const ctx = createService({
      getOnRemoteStreamCallback: () => null,
      createAudioElement: vi.fn(() => remoteAudio)
    });
    const remoteStream = { getAudioTracks: () => [{ id: 'no_callback_track' }] };

    await ctx.service.handleIncomingRemoteStream(remoteStream);

    expect(ctx.createAudioElement).toHaveBeenCalledTimes(1);
    expect(ctx.appendElement).toHaveBeenCalledWith(remoteAudio);
    expect(remoteAudio.srcObject).toBe(remoteStream);
    expect(remoteAudio.autoplay).toBe(true);
  });

  it('hydrates existing live receiver track', async () => {
    const ctx = createService();
    const liveTrack = { id: 'live_track', kind: 'audio', readyState: 'live' };
    const peerConnection = {
      getReceivers: () => [{ track: liveTrack }]
    };

    await ctx.service.tryHydrateExistingRemoteAudioTrack(peerConnection);

    expect(ctx.createMediaStream).toHaveBeenCalledWith([liveTrack]);
    expect(ctx.aiAudioMgr.init).toHaveBeenCalledTimes(1);
  });

  it('logs errors for invalid track events and AI recorder init failures', async () => {
    const ctx = createService({
      aiAudioMgr: {
        stream: null,
        init: vi.fn(async () => {
          throw new Error('init_failed');
        }),
        isRecording: false
      }
    });
    const peerConnection = {};

    ctx.service.setupPeerTrackHandling(peerConnection);
    await peerConnection.ontrack({});
    expect(ctx.error).toHaveBeenCalledWith('Received track event without a usable remote stream');

    const remoteStream = { getAudioTracks: () => [{ id: 'failing_track' }] };
    await ctx.service.handleIncomingRemoteStream(remoteStream);
    expect(ctx.setAiAudioReady).toHaveBeenCalledWith(false);
    expect(ctx.error).toHaveBeenCalledWith(expect.stringContaining('AI AudioManager init error'));
  });
});
