/**
 * Voice similarity analysis — compares frequency profiles, pitch,
 * MFCC (Mel-Frequency Cepstral Coefficients), and formant features
 * between original voiceprint and synthesized audio.
 */

/**
 * Compute cosine similarity between two equal-length number arrays.
 * Returns a value between 0 (completely different) and 1 (identical).
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  if (len === 0) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < len; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;

  return dotProduct / denominator;
}

/**
 * Convert frequency (Hz) to Mel scale.
 */
function hzToMel(hz: number): number {
  return 2595 * Math.log10(1 + hz / 700);
}

/**
 * Convert Mel scale to frequency (Hz).
 */
function melToHz(mel: number): number {
  return 700 * (Math.pow(10, mel / 2595) - 1);
}

/**
 * Create a Mel filterbank for MFCC computation.
 */
function createMelFilterbank(
  numFilters: number,
  fftSize: number,
  sampleRate: number,
): number[][] {
  const lowMel = hzToMel(0);
  const highMel = hzToMel(sampleRate / 2);

  // Equally spaced mel points
  const melPoints: number[] = [];
  for (let i = 0; i <= numFilters + 1; i++) {
    melPoints.push(lowMel + (highMel - lowMel) * i / (numFilters + 1));
  }

  // Convert back to Hz and then to FFT bin indices
  const bins = melPoints.map(mel => {
    const hz = melToHz(mel);
    return Math.floor((fftSize + 1) * hz / sampleRate);
  });

  // Create triangular filters
  const filters: number[][] = [];
  for (let i = 0; i < numFilters; i++) {
    const filter = new Array(Math.floor(fftSize / 2) + 1).fill(0);
    for (let j = bins[i]; j < bins[i + 1]; j++) {
      if (j < filter.length) {
        filter[j] = (j - bins[i]) / Math.max(1, bins[i + 1] - bins[i]);
      }
    }
    for (let j = bins[i + 1]; j < bins[i + 2]; j++) {
      if (j < filter.length) {
        filter[j] = (bins[i + 2] - j) / Math.max(1, bins[i + 2] - bins[i + 1]);
      }
    }
    filters.push(filter);
  }

  return filters;
}

/**
 * Compute MFCC features from a frequency spectrum (magnitude array).
 *
 * @param spectrum - Magnitude spectrum from FFT
 * @param sampleRate - Audio sample rate
 * @param numCoeffs - Number of MFCC coefficients to return (default 13)
 * @param numFilters - Number of Mel filters (default 26)
 */
export function computeMFCC(
  spectrum: number[],
  sampleRate: number,
  numCoeffs: number = 13,
  numFilters: number = 26,
): number[] {
  const fftSize = (spectrum.length - 1) * 2;
  const filterbank = createMelFilterbank(numFilters, fftSize, sampleRate);

  // Apply filterbank to power spectrum
  const melEnergies: number[] = [];
  for (const filter of filterbank) {
    let energy = 0;
    for (let j = 0; j < spectrum.length && j < filter.length; j++) {
      energy += spectrum[j] * spectrum[j] * filter[j];
    }
    melEnergies.push(Math.log(Math.max(energy, 1e-10)));
  }

  // DCT-II to get MFCCs
  const mfcc: number[] = [];
  for (let i = 0; i < numCoeffs; i++) {
    let sum = 0;
    for (let j = 0; j < numFilters; j++) {
      sum += melEnergies[j] * Math.cos(Math.PI * i * (j + 0.5) / numFilters);
    }
    mfcc.push(sum);
  }

  return mfcc;
}

/**
 * Estimate formant frequencies from a frequency spectrum using peak detection.
 *
 * Formants are resonance frequencies of the vocal tract.
 * F1 (300-900 Hz): jaw openness
 * F2 (850-2500 Hz): tongue position
 * F3 (1500-3500 Hz): lip rounding
 *
 * @param spectrum - Magnitude spectrum from FFT
 * @param sampleRate - Audio sample rate
 * @returns Array of estimated formant frequencies [F1, F2, F3]
 */
export function estimateFormants(
  spectrum: number[],
  sampleRate: number,
): number[] {
  const binWidth = sampleRate / ((spectrum.length - 1) * 2);
  const formants: number[] = [];

  // Formant search ranges in Hz
  const ranges: [number, number][] = [
    [200, 1000],   // F1
    [800, 2800],   // F2
    [1500, 4000],  // F3
  ];

  for (const [lowHz, highHz] of ranges) {
    const lowBin = Math.max(1, Math.floor(lowHz / binWidth));
    const highBin = Math.min(spectrum.length - 2, Math.ceil(highHz / binWidth));

    let maxVal = -Infinity;
    let maxBin = lowBin;

    for (let i = lowBin; i <= highBin; i++) {
      // Look for peaks (local maxima)
      if (spectrum[i] > spectrum[i - 1] && spectrum[i] > spectrum[i + 1]) {
        if (spectrum[i] > maxVal) {
          maxVal = spectrum[i];
          maxBin = i;
        }
      }
    }

    // Parabolic interpolation for sub-bin accuracy
    if (maxBin > 0 && maxBin < spectrum.length - 1) {
      const alpha = spectrum[maxBin - 1];
      const beta = spectrum[maxBin];
      const gamma = spectrum[maxBin + 1];
      const denom = alpha - 2 * beta + gamma;
      const p = denom !== 0 ? 0.5 * (alpha - gamma) / denom : 0;
      formants.push((maxBin + p) * binWidth);
    } else {
      formants.push(maxBin * binWidth);
    }
  }

  return formants;
}

/**
 * Compare formant frequencies between two voice samples.
 * Returns a similarity score between 0 and 1.
 */
export function formantSimilarity(
  formantsA: number[],
  formantsB: number[],
): number {
  if (formantsA.length === 0 || formantsB.length === 0) return 0;

  const len = Math.min(formantsA.length, formantsB.length);
  let totalSim = 0;

  // Weight formants: F1 most important, F3 least
  const weights = [0.5, 0.35, 0.15];

  for (let i = 0; i < len; i++) {
    const delta = Math.abs(formantsA[i] - formantsB[i]);
    // Tolerance of ~200 Hz per formant
    const sim = Math.max(0, 1 - delta / 200);
    totalSim += sim * (weights[i] || weights[weights.length - 1]);
  }

  return totalSim;
}

/**
 * Compare two frequency profiles and voice features, returning a composite
 * similarity score between 0 and 100.
 *
 * Enhanced weights:
 * - 35% frequency profile cosine similarity
 * - 25% MFCC similarity
 * - 20% formant similarity
 * - 20% pitch proximity (within 50Hz considered identical)
 */
export function computeVoiceSimilarity(
  originalProfile: number[],
  synthesizedProfile: number[],
  originalPitch: number,
  synthesizedPitch: number,
  options?: {
    sampleRate?: number;
    originalFormants?: number[];
    synthesizedFormants?: number[];
  },
): number {
  const sampleRate = options?.sampleRate || 44100;

  // 1. Frequency profile cosine similarity
  const profileSim = cosineSimilarity(originalProfile, synthesizedProfile);

  // 2. Pitch proximity
  const pitchDelta = Math.abs(originalPitch - synthesizedPitch);
  const pitchSim = Math.max(0, 1 - pitchDelta / 50);

  // 3. MFCC similarity
  let mfccSim = 0;
  if (originalProfile.length > 0 && synthesizedProfile.length > 0) {
    const mfccA = computeMFCC(originalProfile, sampleRate);
    const mfccB = computeMFCC(synthesizedProfile, sampleRate);
    mfccSim = cosineSimilarity(mfccA, mfccB);
  }

  // 4. Formant similarity
  let formSim = 0;
  if (options?.originalFormants && options?.synthesizedFormants) {
    formSim = formantSimilarity(options.originalFormants, options.synthesizedFormants);
  } else if (originalProfile.length > 0 && synthesizedProfile.length > 0) {
    const formantsA = estimateFormants(originalProfile, sampleRate);
    const formantsB = estimateFormants(synthesizedProfile, sampleRate);
    formSim = formantSimilarity(formantsA, formantsB);
  }

  // Composite: adjust weights based on available data
  const hasFormants = options?.originalFormants || (originalProfile.length > 0 && synthesizedProfile.length > 0);
  let composite: number;

  if (hasFormants) {
    composite = profileSim * 0.35 + mfccSim * 0.25 + formSim * 0.20 + pitchSim * 0.20;
  } else {
    // Fallback to simpler weights when no formant data
    composite = profileSim * 0.70 + pitchSim * 0.30;
  }

  return Math.round(composite * 100);
}

/**
 * Get a human-readable quality label for a similarity score.
 */
export function getSimilarityLabel(score: number): {
  label: string;
  labelKey: string;
  color: string;
} {
  if (score >= 85) return { label: '极高', labelKey: 'similarity.excellent', color: 'text-green-600' };
  if (score >= 70) return { label: '良好', labelKey: 'similarity.good', color: 'text-blue-600' };
  if (score >= 50) return { label: '中等', labelKey: 'similarity.fair', color: 'text-amber-600' };
  return { label: '待提升', labelKey: 'similarity.needsWork', color: 'text-red-500' };
}
