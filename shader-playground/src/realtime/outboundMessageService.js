export class OutboundMessageService {
  constructor({
    getDataChannel,
    makeEventId = () => crypto.randomUUID(),
    error = () => {}
  }) {
    this.getDataChannel = getDataChannel;
    this.makeEventId = makeEventId;
    this.error = error;
  }

  sendTextMessage(text) {
    const dataChannel = this.getDataChannel();
    if (!dataChannel || dataChannel.readyState !== 'open') {
      this.error('Cannot send message: data channel not open');
      return false;
    }

    const event = {
      type: 'conversation.item.create',
      event_id: this.makeEventId(),
      item: {
        type: 'message',
        role: 'user',
        content: [
          { type: 'input_text', text }
        ]
      }
    };
    dataChannel.send(JSON.stringify(event));

    const responseEvent = {
      type: 'response.create',
      event_id: this.makeEventId()
    };
    dataChannel.send(JSON.stringify(responseEvent));

    return true;
  }
}
