import { describe, it, expect } from 'vitest';
import {
  extractFrequencyProfile,
  estimateAveragePitch,
  audioBufferToBase64,
  audioBufferToBlob,
} from '../audioAnalyzer';

// ---------------------------------------------------------------------------
// Helpers: create a minimal AudioBuffer-like object for Node/jsdom
// ---------------------------------------------------------------------------

function createFakeAudioBuffer(
  channelData: Float32Array,
  sampleRate: number
): AudioBuffer {
  return {
    sampleRate,
    length: channelData.length,
    numberOfChannels: 1,
    duration: channelData.length / sampleRate,
    getChannelData() {
      return channelData;
    },
    copyFromChannel() {},
    copyToChannel() {},
  } as unknown as AudioBuffer;
}

/**
 * Generate a pure sine wave at a given frequency.
 */
function generateSineWave(
  frequency: number,
  sampleRate: number,
  durationSeconds: number
): Float32Array {
  const length = Math.floor(sampleRate * durationSeconds);
  const data = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    data[i] = Math.sin(2 * Math.PI * frequency * (i / sampleRate));
  }
  return data;
}

// ---------------------------------------------------------------------------
// FFT tests
// ---------------------------------------------------------------------------

describe('extractFrequencyProfile (FFT)', () => {
  it('returns an array of 64 bins', () => {
    // Need at least 2048 samples for a single FFT frame
    const data = new Float32Array(4096);
    const buf = createFakeAudioBuffer(data, 44100);
    const profile = extractFrequencyProfile(buf);
    expect(profile).toHaveLength(64);
  });

  it('output values are normalized between 0 and 1', () => {
    const data = generateSineWave(440, 44100, 0.5);
    const buf = createFakeAudioBuffer(data, 44100);
    const profile = extractFrequencyProfile(buf);

    for (const val of profile) {
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThanOrEqual(1);
    }
  });

  it('detects energy in the correct bin for a 440 Hz tone', () => {
    const sampleRate = 44100;
    const data = generateSineWave(440, sampleRate, 0.5);
    const buf = createFakeAudioBuffer(data, sampleRate);
    const profile = extractFrequencyProfile(buf);

    // FFT size = 2048, half = 1024 bins over 0-22050 Hz
    // Compressed to 64 bins -> each bin covers ~1024/64 = 16 raw bins
    // freq resolution = sampleRate / fftSize = 44100/2048 ~= 21.5 Hz per raw bin
    // 440 Hz -> raw bin ~20.5 -> compressed bin ~1
    // The energy should be concentrated in the low bins
    const peakBin = profile.indexOf(Math.max(...profile));
    expect(peakBin).toBeLessThan(5); // 440 Hz should land in one of the first few bins
  });

  it('returns all zeros for silent input', () => {
    const data = new Float32Array(4096); // all zeros
    const buf = createFakeAudioBuffer(data, 44100);
    const profile = extractFrequencyProfile(buf);
    expect(profile.every((v) => v === 0)).toBe(true);
  });

  it('returns 64 zeros when buffer is too short for a single frame', () => {
    const data = new Float32Array(512); // less than fftSize of 2048
    const buf = createFakeAudioBuffer(data, 44100);
    const profile = extractFrequencyProfile(buf);
    expect(profile).toHaveLength(64);
    expect(profile.every((v) => v === 0)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// YIN pitch detection tests
// ---------------------------------------------------------------------------

describe('estimateAveragePitch (YIN)', () => {
  it('detects ~440 Hz for a 440 Hz sine wave', () => {
    const sampleRate = 44100;
    // Need enough samples for multiple analysis segments (8192 per segment)
    const data = generateSineWave(440, sampleRate, 1.0);
    const buf = createFakeAudioBuffer(data, sampleRate);
    const pitch = estimateAveragePitch(buf);

    // Allow 5% tolerance
    expect(pitch).toBeGreaterThan(418);
    expect(pitch).toBeLessThan(462);
  });

  it('detects ~200 Hz for a 200 Hz sine wave', () => {
    const sampleRate = 44100;
    const data = generateSineWave(200, sampleRate, 1.0);
    const buf = createFakeAudioBuffer(data, sampleRate);
    const pitch = estimateAveragePitch(buf);

    expect(pitch).toBeGreaterThan(190);
    expect(pitch).toBeLessThan(210);
  });

  it('returns default 150 Hz for silence', () => {
    const data = new Float32Array(44100); // 1 second of silence
    const buf = createFakeAudioBuffer(data, 44100);
    const pitch = estimateAveragePitch(buf);
    expect(pitch).toBe(150);
  });
});

// ---------------------------------------------------------------------------
// Blob / Base64 conversion tests
// ---------------------------------------------------------------------------

describe('audioBufferToBlob', () => {
  it('produces a Blob of type audio/wav', () => {
    const data = new Float32Array(1024);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const buf = createFakeAudioBuffer(data, 44100);

    const blob = audioBufferToBlob(buf);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('audio/wav');
  });

  it('produces a WAV blob with correct header size (44 + samples*2)', () => {
    const numSamples = 512;
    const data = new Float32Array(numSamples);
    const buf = createFakeAudioBuffer(data, 44100);

    const blob = audioBufferToBlob(buf);
    expect(blob.size).toBe(44 + numSamples * 2);
  });
});

describe('audioBufferToBase64', () => {
  it('returns a non-empty base64 string', () => {
    const data = new Float32Array(256);
    for (let i = 0; i < data.length; i++) data[i] = Math.sin(i * 0.1);
    const buf = createFakeAudioBuffer(data, 44100);

    const b64 = audioBufferToBase64(buf);
    expect(typeof b64).toBe('string');
    expect(b64.length).toBeGreaterThan(0);
    // Verify it's valid base64 — atob should not throw
    expect(() => atob(b64)).not.toThrow();
  });

  it('base64 output starts with RIFF WAV header bytes', () => {
    const data = new Float32Array(256);
    const buf = createFakeAudioBuffer(data, 44100);
    const b64 = audioBufferToBase64(buf);
    const decoded = atob(b64);
    expect(decoded.slice(0, 4)).toBe('RIFF');
    expect(decoded.slice(8, 12)).toBe('WAVE');
  });
});
