import { describe, it, expect } from 'vitest';
import { audioBufferToWav } from '../audioExport';

/**
 * Create a minimal AudioBuffer-like object for testing.
 * jsdom doesn't have AudioContext, so we mock the interface.
 */
function createMockAudioBuffer(
  length: number,
  sampleRate: number,
  channels: number = 1,
): AudioBuffer {
  const channelData: Float32Array[] = [];
  for (let ch = 0; ch < channels; ch++) {
    const data = new Float32Array(length);
    for (let i = 0; i < length; i++) {
      data[i] = Math.sin(2 * Math.PI * 440 * i / sampleRate); // 440Hz sine
    }
    channelData.push(data);
  }

  return {
    length,
    sampleRate,
    numberOfChannels: channels,
    duration: length / sampleRate,
    getChannelData: (ch: number) => channelData[ch],
    copyFromChannel: () => {},
    copyToChannel: () => {},
  } as unknown as AudioBuffer;
}

describe('audioBufferToWav', () => {
  it('should produce a valid WAV blob', () => {
    const buffer = createMockAudioBuffer(44100, 44100); // 1 second
    const blob = audioBufferToWav(buffer);

    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('audio/wav');
    // WAV header = 44 bytes + 44100 samples * 2 bytes = 88244
    expect(blob.size).toBe(44 + 44100 * 2);
  });

  it('should handle stereo buffers', () => {
    const buffer = createMockAudioBuffer(1000, 44100, 2);
    const blob = audioBufferToWav(buffer);

    expect(blob.type).toBe('audio/wav');
    // 44 header + 1000 samples * 2 channels * 2 bytes = 4044
    expect(blob.size).toBe(44 + 1000 * 2 * 2);
  });

  it('should have correct RIFF header', async () => {
    const buffer = createMockAudioBuffer(100, 22050);
    const blob = audioBufferToWav(buffer);
    const arrayBuffer = await blob.arrayBuffer();
    const view = new DataView(arrayBuffer);

    // Check RIFF magic
    expect(String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3))).toBe('RIFF');
    // Check WAVE magic
    expect(String.fromCharCode(view.getUint8(8), view.getUint8(9), view.getUint8(10), view.getUint8(11))).toBe('WAVE');
    // Check sample rate
    expect(view.getUint32(24, true)).toBe(22050);
    // Check PCM format
    expect(view.getUint16(20, true)).toBe(1);
    // Check bits per sample
    expect(view.getUint16(34, true)).toBe(16);
  });

  it('should clamp samples to [-1, 1]', async () => {
    const buffer = createMockAudioBuffer(10, 44100);
    // Force values out of range
    const data = buffer.getChannelData(0);
    data[0] = 2.0;  // over max
    data[1] = -2.0; // under min

    const blob = audioBufferToWav(buffer);
    const arrayBuffer = await blob.arrayBuffer();
    const view = new DataView(arrayBuffer);

    // Sample at offset 44 should be clamped to 0x7FFF (32767)
    expect(view.getInt16(44, true)).toBe(32767);
    // Sample at offset 46 should be clamped to -0x8000 (-32768)
    expect(view.getInt16(46, true)).toBe(-32768);
  });

  it('should handle zero-length buffer', () => {
    const buffer = createMockAudioBuffer(0, 44100);
    const blob = audioBufferToWav(buffer);
    expect(blob.size).toBe(44); // Header only
  });
});
