import { describe, it, expect, vi } from 'vitest';
import {
  SessionConnectionState,
  CONNECTION_STATES
} from '../../realtime/sessionConnectionState.js';

describe('SessionConnectionState', () => {
  it('tracks isConnected/isConnecting flags from state transitions', () => {
    const machine = new SessionConnectionState();

    expect(machine.getSnapshot()).toEqual({
      state: CONNECTION_STATES.IDLE,
      isConnected: false,
      isConnecting: false
    });

    machine.transition(CONNECTION_STATES.CONNECTING, { reason: 'start_connect' });
    expect(machine.getSnapshot()).toEqual({
      state: CONNECTION_STATES.CONNECTING,
      isConnected: false,
      isConnecting: true
    });

    machine.transition(CONNECTION_STATES.CONNECTED, { reason: 'channel_open' });
    expect(machine.getSnapshot()).toEqual({
      state: CONNECTION_STATES.CONNECTED,
      isConnected: true,
      isConnecting: false
    });
  });

  it('warns but still transitions when transition is unexpected', () => {
    const warn = vi.fn();
    const machine = new SessionConnectionState({ warn });

    machine.transition(CONNECTION_STATES.CONNECTED, { reason: 'forced_state' });

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('Unexpected connection state transition idle -> connected')
    );
    expect(machine.getSnapshot().state).toBe(CONNECTION_STATES.CONNECTED);
  });

  it('ignores unknown states', () => {
    const warn = vi.fn();
    const machine = new SessionConnectionState({ warn });

    machine.transition('totally_unknown_state');

    expect(warn).toHaveBeenCalledWith(
      'Ignoring unknown connection state transition target "totally_unknown_state"'
    );
    expect(machine.getSnapshot().state).toBe(CONNECTION_STATES.IDLE);
  });
});
