// Helpers for the raw PCM16 audio path used by the WebSocket realtime
// transport. WebRTC carries audio as media tracks, but over WebSocket the
// Realtime API exchanges base64-encoded 24kHz mono PCM16 buffers.

const BASE64_CHUNK_SIZE = 0x8000;

export function floatTo16BitPcm(float32) {
  const int16 = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i += 1) {
    const sample = Math.max(-1, Math.min(1, float32[i]));
    int16[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }
  return int16;
}

export function int16ToFloat32(int16) {
  const float32 = new Float32Array(int16.length);
  for (let i = 0; i < int16.length; i += 1) {
    const sample = int16[i];
    float32[i] = sample < 0 ? sample / 0x8000 : sample / 0x7fff;
  }
  return float32;
}

export function int16ToBase64(int16) {
  const bytes = new Uint8Array(int16.buffer, int16.byteOffset, int16.byteLength);
  let binary = '';
  for (let i = 0; i < bytes.length; i += BASE64_CHUNK_SIZE) {
    binary += String.fromCharCode(...bytes.subarray(i, i + BASE64_CHUNK_SIZE));
  }
  return globalThis.btoa(binary);
}

export function base64ToInt16(base64) {
  const binary = globalThis.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  // Trailing odd byte would make an invalid Int16Array view; drop it.
  const evenLength = bytes.length - (bytes.length % 2);
  return new Int16Array(bytes.buffer, 0, evenLength / 2);
}

// Handles both directions: averaging when reducing the rate, linear
// interpolation when raising it (some devices only offer sub-24kHz contexts,
// e.g. Bluetooth hands-free profiles).
export function resampleFloat32(input, fromRate, toRate) {
  if (fromRate === toRate) return input;

  if (fromRate > toRate) {
    const ratio = fromRate / toRate;
    const outputLength = Math.floor(input.length / ratio);
    const output = new Float32Array(outputLength);
    for (let i = 0; i < outputLength; i += 1) {
      const start = Math.floor(i * ratio);
      const end = Math.min(Math.floor((i + 1) * ratio), input.length);
      let sum = 0;
      for (let j = start; j < end; j += 1) sum += input[j];
      output[i] = end > start ? sum / (end - start) : input[start] || 0;
    }
    return output;
  }

  const ratio = fromRate / toRate;
  const outputLength = Math.floor(input.length / ratio);
  const output = new Float32Array(outputLength);
  for (let i = 0; i < outputLength; i += 1) {
    const position = i * ratio;
    const index = Math.floor(position);
    const fraction = position - index;
    const current = input[index] ?? 0;
    const next = input[index + 1] ?? current;
    output[i] = current + (next - current) * fraction;
  }
  return output;
}
