export const CONNECTION_STATES = Object.freeze({
  IDLE: 'idle',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  RECONNECTING: 'reconnecting',
  FAILED: 'failed'
});

const ALLOWED_TRANSITIONS = Object.freeze({
  [CONNECTION_STATES.IDLE]: new Set([
    CONNECTION_STATES.CONNECTING
  ]),
  [CONNECTION_STATES.CONNECTING]: new Set([
    CONNECTION_STATES.CONNECTED,
    CONNECTION_STATES.FAILED,
    CONNECTION_STATES.IDLE
  ]),
  [CONNECTION_STATES.CONNECTED]: new Set([
    CONNECTION_STATES.RECONNECTING,
    CONNECTION_STATES.FAILED,
    CONNECTION_STATES.IDLE
  ]),
  [CONNECTION_STATES.RECONNECTING]: new Set([
    CONNECTION_STATES.CONNECTING,
    CONNECTION_STATES.CONNECTED,
    CONNECTION_STATES.FAILED,
    CONNECTION_STATES.IDLE
  ]),
  [CONNECTION_STATES.FAILED]: new Set([
    CONNECTION_STATES.CONNECTING,
    CONNECTION_STATES.IDLE
  ])
});

export class SessionConnectionState {
  constructor({
    warn = () => {}
  } = {}) {
    this.warn = warn;
    this.state = CONNECTION_STATES.IDLE;
  }

  getSnapshot() {
    return {
      state: this.state,
      isConnected: this.state === CONNECTION_STATES.CONNECTED,
      isConnecting: this.state === CONNECTION_STATES.CONNECTING
    };
  }

  transition(nextState, { reason = '' } = {}) {
    if (!Object.values(CONNECTION_STATES).includes(nextState)) {
      this.warn(`Ignoring unknown connection state transition target "${nextState}"`);
      return this.getSnapshot();
    }

    if (this.state === nextState) {
      return this.getSnapshot();
    }

    const allowed = ALLOWED_TRANSITIONS[this.state];
    if (!allowed || !allowed.has(nextState)) {
      this.warn(
        `Unexpected connection state transition ${this.state} -> ${nextState}${reason ? ` (${reason})` : ''}`
      );
    }

    this.state = nextState;
    return this.getSnapshot();
  }
}
