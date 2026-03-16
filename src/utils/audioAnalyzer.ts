/**
 * Audio analysis utilities for voiceprint extraction.
 *
 * In production, voiceprint extraction would use a neural speaker encoder
 * (e.g., resemblyzer, SpeechBrain). Here we extract frequency-domain features
 * using the Web Audio API to create a visual "voiceprint" fingerprint and
 * estimate pitch characteristics.
 */

/** Extract frequency profile from an AudioBuffer for visualization */
export function extractFrequencyProfile(audioBuffer: AudioBuffer): number[] {
  const channelData = audioBuffer.getChannelData(0);
  const sampleRate = audioBuffer.sampleRate;
  const fftSize = 2048;
  const hopSize = fftSize / 2;
  const numBins = 64; // compressed frequency bins for visualization

  const frames: number[][] = [];

  for (let offset = 0; offset + fftSize <= channelData.length; offset += hopSize) {
    const frame = new Float32Array(fftSize);
    for (let i = 0; i < fftSize; i++) {
      // Apply Hanning window
      const window = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (fftSize - 1)));
      frame[i] = channelData[offset + i] * window;
    }

    const magnitudes = computeFFTMagnitudes(frame);

    // Compress to numBins by averaging
    const binSize = Math.floor(magnitudes.length / numBins);
    const compressed: number[] = [];
    for (let b = 0; b < numBins; b++) {
      let sum = 0;
      for (let j = 0; j < binSize; j++) {
        sum += magnitudes[b * binSize + j];
      }
      compressed.push(sum / binSize);
    }
    frames.push(compressed);
  }

  // Average across all frames to get a single frequency profile
  const profile = new Array(numBins).fill(0);
  for (const frame of frames) {
    for (let i = 0; i < numBins; i++) {
      profile[i] += frame[i];
    }
  }
  for (let i = 0; i < numBins; i++) {
    profile[i] /= frames.length || 1;
  }

  // Normalize to 0-1 range
  const max = Math.max(...profile, 0.001);
  return profile.map(v => v / max);
}

/** Estimate average pitch using autocorrelation */
export function estimateAveragePitch(audioBuffer: AudioBuffer): number {
  const channelData = audioBuffer.getChannelData(0);
  const sampleRate = audioBuffer.sampleRate;

  // Use autocorrelation on a middle segment
  const segmentLength = Math.min(8192, channelData.length);
  const start = Math.floor((channelData.length - segmentLength) / 2);
  const segment = channelData.slice(start, start + segmentLength);

  // Autocorrelation
  const minLag = Math.floor(sampleRate / 500); // 500 Hz max
  const maxLag = Math.floor(sampleRate / 60);  // 60 Hz min

  let bestCorrelation = -1;
  let bestLag = minLag;

  for (let lag = minLag; lag < maxLag && lag < segment.length; lag++) {
    let correlation = 0;
    let norm1 = 0;
    let norm2 = 0;
    const len = segment.length - lag;

    for (let i = 0; i < len; i++) {
      correlation += segment[i] * segment[i + lag];
      norm1 += segment[i] * segment[i];
      norm2 += segment[i + lag] * segment[i + lag];
    }

    const normalizedCorrelation = correlation / (Math.sqrt(norm1 * norm2) || 1);

    if (normalizedCorrelation > bestCorrelation) {
      bestCorrelation = normalizedCorrelation;
      bestLag = lag;
    }
  }

  if (bestCorrelation < 0.3) {
    return 150; // Default if no clear pitch detected
  }

  return Math.round(sampleRate / bestLag);
}

/** Simple DFT magnitude computation (for small FFT sizes in browser) */
function computeFFTMagnitudes(signal: Float32Array): number[] {
  const N = signal.length;
  const halfN = N / 2;
  const magnitudes: number[] = [];

  for (let k = 0; k < halfN; k++) {
    let real = 0;
    let imag = 0;
    for (let n = 0; n < N; n++) {
      const angle = (2 * Math.PI * k * n) / N;
      real += signal[n] * Math.cos(angle);
      imag -= signal[n] * Math.sin(angle);
    }
    magnitudes.push(Math.sqrt(real * real + imag * imag) / N);
  }

  return magnitudes;
}

/** Convert AudioBuffer to base64-encoded WAV */
export function audioBufferToBase64(audioBuffer: AudioBuffer): string {
  const numChannels = 1;
  const sampleRate = audioBuffer.sampleRate;
  const channelData = audioBuffer.getChannelData(0);
  const length = channelData.length;

  // Create WAV file
  const wavBuffer = new ArrayBuffer(44 + length * 2);
  const view = new DataView(wavBuffer);

  // WAV header
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + length * 2, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * 2, true);
  view.setUint16(32, numChannels * 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, 'data');
  view.setUint32(40, length * 2, true);

  // Write PCM data
  let offset = 44;
  for (let i = 0; i < length; i++) {
    const sample = Math.max(-1, Math.min(1, channelData[i]));
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
    offset += 2;
  }

  // Convert to base64
  const bytes = new Uint8Array(wavBuffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/** Convert base64 WAV back to AudioBuffer */
export async function base64ToAudioBuffer(
  base64: string,
  audioContext: AudioContext
): Promise<AudioBuffer> {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return audioContext.decodeAudioData(bytes.buffer);
}

function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}
