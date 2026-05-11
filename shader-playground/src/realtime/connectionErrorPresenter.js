export class ConnectionErrorPresenter {
  constructor({
    deviceType,
    setPTTStatus,
    getMobileHelpElement = () => {
      const doc = globalThis.document;
      return doc?.getElementById?.('mobileHelp') || null;
    },
    schedule = (...args) => globalThis.setTimeout(...args),
    log = () => {}
  }) {
    this.deviceType = deviceType;
    this.setPTTStatus = setPTTStatus;
    this.getMobileHelpElement = getMobileHelpElement;
    this.schedule = schedule;
    this.log = log;
  }

  handleConnectError(error) {
    const errorText = this.resolveErrorText(error);
    this.setPTTStatus(errorText, '#c00');

    this.schedule(() => {
      if (this.deviceType === 'mobile' && errorText === 'Mic Access') {
        this.setPTTStatus('Allow Mic', '#44f');
        const mobileHelp = this.getMobileHelpElement();
        if (mobileHelp) {
          mobileHelp.style.display = 'block';
        }
        this.log('Mobile microphone troubleshooting: Check browser permissions, try refreshing, or use Chrome/Safari');
      } else {
        this.setPTTStatus('Try Again', '#44f');
      }
    }, 3000);
    return errorText;
  }

  resolveErrorText(error) {
    const message = typeof error?.message === 'string' ? error.message : '';
    if (message.includes('getUserMedia') || message.includes('Permission')) {
      return this.deviceType === 'mobile' ? 'Mic Access' : 'Mic Error';
    }
    if (message.includes('SDP') || message.includes('WebRTC')) {
      return this.deviceType === 'mobile' ? 'Connection' : 'WebRTC Error';
    }
    if (message.includes('token') || message.includes('fetch')) {
      return 'Network';
    }
    return 'Error';
  }
}
