import { describe, it, expect, vi } from 'vitest';
import { OutboundMessageService } from '../../realtime/outboundMessageService.js';

describe('OutboundMessageService', () => {
  it('sends conversation item and response.create when channel is open', () => {
    const dataChannel = {
      readyState: 'open',
      send: vi.fn()
    };
    const service = new OutboundMessageService({
      getDataChannel: () => dataChannel,
      makeEventId: vi.fn()
        .mockReturnValueOnce('evt-1')
        .mockReturnValueOnce('evt-2')
    });

    const result = service.sendTextMessage('hello world');

    expect(result).toBe(true);
    expect(dataChannel.send).toHaveBeenCalledTimes(2);
    expect(JSON.parse(dataChannel.send.mock.calls[0][0])).toEqual({
      type: 'conversation.item.create',
      event_id: 'evt-1',
      item: {
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text: 'hello world' }]
      }
    });
    expect(JSON.parse(dataChannel.send.mock.calls[1][0])).toEqual({
      type: 'response.create',
      event_id: 'evt-2'
    });
  });

  it('returns false and logs when channel is missing or closed', () => {
    const error = vi.fn();
    const serviceMissing = new OutboundMessageService({
      getDataChannel: () => null,
      error
    });
    const serviceClosed = new OutboundMessageService({
      getDataChannel: () => ({
        readyState: 'closing',
        send: vi.fn()
      }),
      error
    });

    expect(serviceMissing.sendTextMessage('x')).toBe(false);
    expect(serviceClosed.sendTextMessage('y')).toBe(false);
    expect(error).toHaveBeenCalledTimes(2);
    expect(error).toHaveBeenCalledWith('Cannot send message: data channel not open');
  });
});
