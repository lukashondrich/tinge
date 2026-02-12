export class PttOrchestrator {
  constructor({
    getPTTButton,
    getIsMicActive,
    setIsMicActive,
    getIsConnected,
    getIsConnecting,
    getAudioTrack,
    getDataChannel,
    resetPendingRecording,
    setPendingUserRecord,
    setPendingUserRecordPromise,
    checkTokenLimit,
    connect,
    waitForDataChannelOpen = async () => true,
    userAudioMgr,
    onEvent,
    error = () => {},
    makeEventId = () => crypto.randomUUID(),
    schedule = (...args) => globalThis.setTimeout(...args)
  }) {
    this.getPTTButton = getPTTButton;
    this.getIsMicActive = getIsMicActive;
    this.setIsMicActive = setIsMicActive;
    this.getIsConnected = getIsConnected;
    this.getIsConnecting = getIsConnecting;
    this.getAudioTrack = getAudioTrack;
    this.getDataChannel = getDataChannel;
    this.resetPendingRecording = resetPendingRecording;
    this.setPendingUserRecord = setPendingUserRecord;
    this.setPendingUserRecordPromise = setPendingUserRecordPromise;
    this.checkTokenLimit = checkTokenLimit;
    this.connect = connect;
    this.waitForDataChannelOpen = waitForDataChannelOpen;
    this.userAudioMgr = userAudioMgr;
    this.onEvent = onEvent;
    this.error = error;
    this.makeEventId = makeEventId;
    this.schedule = schedule;
  }

  setPTTStatus(text, color) {
    const button = this.getPTTButton();
    if (!button) return;
    button.innerText = text;
    button.style.backgroundColor = color;
  }

  setPTTReadyStatus() {
    if (this.getIsMicActive()) return;
    this.setPTTStatus('Push to Talk', '#44f');
  }

  enableMicrophone() {
    const track = this.getAudioTrack();
    if (track && this.getIsConnected()) {
      track.enabled = true;
      this.setIsMicActive(true);
      this.setPTTStatus('Talking', '#f00');
    } else {
      this.error('Cannot enable microphone - no audio track available');
    }
  }

  disableMicrophone() {
    const track = this.getAudioTrack();
    if (track) {
      track.enabled = false;
    }
    this.setIsMicActive(false);
    if (this.getIsConnected()) {
      this.setPTTReadyStatus();
    }
  }

  async handlePTTPress() {
    if (this.getIsConnecting()) {
      return { allowed: false, reason: 'connecting' };
    }

    this.resetPendingRecording();
    const limitCheck = await this.checkTokenLimit();
    if (!limitCheck.allowed) {
      return { allowed: false, reason: limitCheck.reason };
    }

    if (!this.getIsConnected()) {
      try {
        await this.connect();
        if (!this.getIsConnected()) {
          return { allowed: false, reason: 'not_connected' };
        }
      } catch (err) {
        this.error(`Connection failed: ${err.message}`);
        return { allowed: false, reason: 'connection_failed', error: err };
      }
    }

    const channelReady = await this.waitForDataChannelOpen();
    if (!channelReady) {
      this.error('Cannot start PTT - data channel did not open in time');
      return { allowed: false, reason: 'data_channel_not_open' };
    }

    const dataChannel = this.getDataChannel();
    if (dataChannel && dataChannel.readyState === 'open') {
      dataChannel.send(JSON.stringify({
        type: 'input_audio_buffer.clear',
        event_id: this.makeEventId()
      }));
    } else {
      this.error('Cannot clear buffer - data channel not open');
      return { allowed: false, reason: 'data_channel_not_open' };
    }

    this.userAudioMgr.startRecording();
    this.onEvent?.({ type: 'input_audio_buffer.speech_started' });
    this.enableMicrophone();
    return { allowed: true };
  }

  handlePTTRelease({ bufferTime }) {
    if (this.userAudioMgr.isRecording) {
      const pendingPromise = this.userAudioMgr
        .stopRecording('...')
        .then((record) => {
          if (!record) return null;
          this.setPendingUserRecord(record);
          return record;
        })
        .catch((err) => {
          this.error(`User stop error: ${err}`);
          return null;
        });
      this.setPendingUserRecordPromise(pendingPromise);
    }

    this.schedule(() => {
      this.disableMicrophone();
      this.onEvent?.({ type: 'input_audio_buffer.speech_stopped' });

      const dataChannel = this.getDataChannel();
      if (dataChannel && dataChannel.readyState === 'open') {
        dataChannel.send(JSON.stringify({
          type: 'input_audio_buffer.commit',
          event_id: this.makeEventId()
        }));
        dataChannel.send(JSON.stringify({
          type: 'response.create',
          event_id: this.makeEventId()
        }));
      } else {
        this.error('Cannot commit audio - data channel not open');
      }
    }, bufferTime);
  }
}
