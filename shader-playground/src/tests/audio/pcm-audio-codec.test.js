import { describe, it, expect } from 'vitest';
import {
  floatTo16BitPcm,
  int16ToFloat32,
  int16ToBase64,
  base64ToInt16,
  resampleFloat32
} from '../../audio/pcmAudioCodec.js';

describe('pcmAudioCodec', () => {
  it('round-trips float samples through PCM16', () => {
    const input = new Float32Array([0, 0.5, -0.5, 1, -1]);
    const roundTripped = int16ToFloat32(floatTo16BitPcm(input));

    for (let i = 0; i < input.length; i += 1) {
      expect(roundTripped[i]).toBeCloseTo(input[i], 3);
    }
  });

  it('clamps out-of-range samples', () => {
    const int16 = floatTo16BitPcm(new Float32Array([2, -2]));
    expect(int16[0]).toBe(0x7fff);
    expect(int16[1]).toBe(-0x8000);
  });

  it('round-trips PCM16 through base64', () => {
    const input = new Int16Array([0, 1, -1, 32767, -32768, 12345]);
    const decoded = base64ToInt16(int16ToBase64(input));

    expect(Array.from(decoded)).toEqual(Array.from(input));
  });

  it('handles large buffers without call-stack overflow', () => {
    const input = new Int16Array(200000).fill(4096);
    const decoded = base64ToInt16(int16ToBase64(input));

    expect(decoded.length).toBe(input.length);
    expect(decoded[199999]).toBe(4096);
  });

  it('downsamples 48kHz to 24kHz by averaging pairs', () => {
    const input = new Float32Array([0, 1, 0, 1, 0, 1, 0, 1]);
    const output = resampleFloat32(input, 48000, 24000);

    expect(output.length).toBe(4);
    output.forEach((sample) => expect(sample).toBeCloseTo(0.5, 5));
  });

  it('passes through when rates match', () => {
    const input = new Float32Array([0.1, 0.2]);
    expect(resampleFloat32(input, 24000, 24000)).toBe(input);
  });

  it('upsamples sub-24kHz input by linear interpolation', () => {
    // e.g. a Bluetooth hands-free context at 16kHz must still produce audio
    const input = new Float32Array([0, 0.3, 0.6, 0.9]);
    const output = resampleFloat32(input, 12000, 24000);

    expect(output.length).toBe(8);
    expect(output[0]).toBeCloseTo(0, 5);
    expect(output[1]).toBeCloseTo(0.15, 5); // midpoint between 0 and 0.3
    expect(output[2]).toBeCloseTo(0.3, 5);
    expect(output[7]).toBeCloseTo(0.9, 5); // clamps at the final sample
  });
});
