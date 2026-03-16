/**
 * Audio analysis utilities for voiceprint extraction.
 *
 * Uses Cooley-Tukey radix-2 FFT and YIN pitch detection for accurate,
 * performant analysis in the browser.
 */

// ---------------------------------------------------------------------------
// Cooley-Tukey radix-2 iterative in-place FFT
// ---------------------------------------------------------------------------

/**
 * Bit-reversal permutation for an array of length N (must be power of 2).
 */
function bitReversalPermutation(real: Float32Array, imag: Float32Array): void {
  const N = real.length;
  let j = 0;
  for (let i = 0; i < N - 1; i++) {
    if (i < j) {
      // swap real
      let tmp = real[i];
      real[i] = real[j];
      real[j] = tmp;
      // swap imag
      tmp = imag[i];
      imag[i] = imag[j];
      imag[j] = tmp;
    }
    let k = N >> 1;
    while (k <= j) {
      j -= k;
      k >>= 1;
    }
    j += k;
  }
}

/**
 * In-place iterative Cooley-Tukey radix-2 FFT.
 * `real` and `imag` are modified in place. Length must be a power of 2.
 */
function fft(real: Float32Array, imag: Float32Array): void {
  const N = real.length;

  bitReversalPermutation(real, imag);

  for (let size = 2; size <= N; size *= 2) {
    const halfSize = size / 2;
    const angleStep = -2 * Math.PI / size;

    for (let i = 0; i < N; i += size) {
      for (let j = 0; j < halfSize; j++) {
        const angle = angleStep * j;
        const twiddleReal = Math.cos(angle);
        const twiddleImag = Math.sin(angle);

        const evenIdx = i + j;
        const oddIdx = i + j + halfSize;

        const tReal = twiddleReal * real[oddIdx] - twiddleImag * imag[oddIdx];
        const tImag = twiddleReal * imag[oddIdx] + twiddleImag * real[oddIdx];

        real[oddIdx] = real[evenIdx] - tReal;
        imag[oddIdx] = imag[evenIdx] - tImag;
        real[evenIdx] = real[evenIdx] + tReal;
        imag[evenIdx] = imag[evenIdx] + tImag;
      }
    }
  }
}

/**
 * Compute magnitude spectrum (first half) from a real-valued signal.
 * The input signal length must be a power of 2.
 */
function computeFFTMagnitudes(signal: Float32Array): Float32Array {
  const N = signal.length;
  const real = new Float32Array(N);
  const imag = new Float32Array(N);
  real.set(signal);

  fft(real, imag);

  const halfN = N / 2;
  const magnitudes = new Float32Array(halfN);
  for (let k = 0; k < halfN; k++) {
    magnitudes[k] = Math.sqrt(real[k] * real[k] + imag[k] * imag[k]) / N;
  }
  return magnitudes;
}

// ---------------------------------------------------------------------------
// YIN pitch detection
// ---------------------------------------------------------------------------

/**
 * YIN algorithm for fundamental frequency estimation.
 * Returns pitch in Hz, or 0 if no reliable pitch is found.
 *
 * Steps implemented:
 *   1. Difference function d(tau)
 *   2. Cumulative mean normalized difference d'(tau)
 *   3. Absolute threshold – find first tau where d'(tau) < threshold
 *   4. Parabolic interpolation around the chosen tau
 *   (Steps 5 & 6 of the original paper – best local estimate & best global
 *    estimate – are simplified here since we operate on a single segment.)
 */
function yinPitchDetect(
  signal: Float32Array,
  sampleRate: number,
  threshold: number = 0.15
): number {
  const halfLen = Math.floor(signal.length / 2);

  // Step 1: Difference function
  const diff = new Float32Array(halfLen);
  for (let tau = 0; tau < halfLen; tau++) {
    let sum = 0;
    for (let i = 0; i < halfLen; i++) {
      const delta = signal[i] - signal[i + tau];
      sum += delta * delta;
    }
    diff[tau] = sum;
  }

  // Step 2: Cumulative mean normalized difference function
  const cmndf = new Float32Array(halfLen);
  cmndf[0] = 1;
  let runningSum = 0;
  for (let tau = 1; tau < halfLen; tau++) {
    runningSum += diff[tau];
    cmndf[tau] = diff[tau] / (runningSum / tau);
  }

  // Step 3: Absolute threshold – find first valley below threshold
  // We search within a plausible pitch range (60 Hz – 500 Hz).
  const minTau = Math.max(2, Math.floor(sampleRate / 500));
  const maxTau = Math.min(halfLen - 1, Math.floor(sampleRate / 60));

  let bestTau = -1;
  for (let tau = minTau; tau < maxTau; tau++) {
    if (cmndf[tau] < threshold) {
      // Walk to the local minimum from here
      while (tau + 1 < maxTau && cmndf[tau + 1] < cmndf[tau]) {
        tau++;
      }
      bestTau = tau;
      break;
    }
  }

  // If no value below threshold, fall back to the global minimum in range
  if (bestTau === -1) {
    let minVal = Infinity;
    for (let tau = minTau; tau < maxTau; tau++) {
      if (cmndf[tau] < minVal) {
        minVal = cmndf[tau];
        bestTau = tau;
      }
    }
    // If the global minimum is still very high, pitch is unreliable
    if (minVal > 0.5) {
      return 0;
    }
  }

  // Step 4: Parabolic interpolation for sub-sample accuracy
  if (bestTau > 0 && bestTau < halfLen - 1) {
    const s0 = cmndf[bestTau - 1];
    const s1 = cmndf[bestTau];
    const s2 = cmndf[bestTau + 1];
    const shift = (s0 - s2) / (2 * (s0 - 2 * s1 + s2));
    if (isFinite(shift)) {
      bestTau = bestTau + shift;
    }
  }

  return sampleRate / bestTau;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Extract frequency profile from an AudioBuffer for visualization */
export function extractFrequencyProfile(audioBuffer: AudioBuffer): number[] {
  const channelData = audioBuffer.getChannelData(0);
  const fftSize = 2048;
  const hopSize = fftSize / 2;
  const numBins = 64; // compressed frequency bins for visualization

  const frames: Float32Array[] = [];

  for (let offset = 0; offset + fftSize <= channelData.length; offset += hopSize) {
    const frame = new Float32Array(fftSize);
    for (let i = 0; i < fftSize; i++) {
      // Apply Hanning window
      const w = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (fftSize - 1)));
      frame[i] = channelData[offset + i] * w;
    }

    frames.push(computeFFTMagnitudes(frame));
  }

  if (frames.length === 0) {
    return new Array(numBins).fill(0);
  }

  const halfFFT = fftSize / 2;
  const binSize = Math.floor(halfFFT / numBins);

  // Average across all frames and compress to numBins
  const profile = new Array(numBins).fill(0);
  for (const magnitudes of frames) {
    for (let b = 0; b < numBins; b++) {
      let sum = 0;
      for (let j = 0; j < binSize; j++) {
        sum += magnitudes[b * binSize + j];
      }
      profile[b] += sum / binSize;
    }
  }

  for (let i = 0; i < numBins; i++) {
    profile[i] /= frames.length;
  }

  // Normalize to 0-1 range
  const max = Math.max(...profile, 0.001);
  return profile.map((v: number) => v / max);
}

/** Estimate average pitch using the YIN algorithm */
export function estimateAveragePitch(audioBuffer: AudioBuffer): number {
  const channelData = audioBuffer.getChannelData(0);
  const sampleRate = audioBuffer.sampleRate;

  // Analyse several overlapping segments and take the median pitch
  const segmentLength = Math.min(8192, channelData.length);
  const hopSize = Math.floor(segmentLength / 2);
  const pitches: number[] = [];

  for (let start = 0; start + segmentLength <= channelData.length; start += hopSize) {
    const segment = channelData.slice(start, start + segmentLength);
    const pitch = yinPitchDetect(segment, sampleRate);
    if (pitch > 0) {
      pitches.push(pitch);
    }
  }

  if (pitches.length === 0) {
    return 150; // Default if no clear pitch detected
  }

  // Return median for robustness against outlier frames
  pitches.sort((a, b) => a - b);
  const mid = Math.floor(pitches.length / 2);
  const median =
    pitches.length % 2 === 0
      ? (pitches[mid - 1] + pitches[mid]) / 2
      : pitches[mid];

  return Math.round(median);
}

// ---------------------------------------------------------------------------
// WAV encoding / decoding helpers
// ---------------------------------------------------------------------------

function writeString(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

function encodeWAV(audioBuffer: AudioBuffer): ArrayBuffer {
  const numChannels = 1;
  const sampleRate = audioBuffer.sampleRate;
  const channelData = audioBuffer.getChannelData(0);
  const length = channelData.length;

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

  return wavBuffer;
}

/** Convert AudioBuffer to base64-encoded WAV (backward-compatible) */
export function audioBufferToBase64(audioBuffer: AudioBuffer): string {
  const wavBuffer = encodeWAV(audioBuffer);
  const bytes = new Uint8Array(wavBuffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/** Convert base64 WAV back to AudioBuffer (backward-compatible) */
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

/** Convert AudioBuffer directly to a WAV Blob (no base64 overhead) */
export function audioBufferToBlob(audioBuffer: AudioBuffer): Blob {
  const wavBuffer = encodeWAV(audioBuffer);
  return new Blob([wavBuffer], { type: 'audio/wav' });
}

/** Decode a WAV Blob back into an AudioBuffer */
export async function blobToAudioBuffer(
  blob: Blob,
  audioContext: AudioContext
): Promise<AudioBuffer> {
  const arrayBuffer = await blob.arrayBuffer();
  return audioContext.decodeAudioData(arrayBuffer);
}
