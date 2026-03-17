/**
 * Voice similarity analysis — compares frequency profiles and pitch
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
 * Compare two frequency profiles and a pitch value, returning a composite
 * similarity score between 0 and 100.
 *
 * Weights:
 * - 70% frequency profile cosine similarity
 * - 30% pitch proximity (within 50Hz considered identical)
 */
export function computeVoiceSimilarity(
  originalProfile: number[],
  synthesizedProfile: number[],
  originalPitch: number,
  synthesizedPitch: number,
): number {
  const profileSim = cosineSimilarity(originalProfile, synthesizedProfile);

  const pitchDelta = Math.abs(originalPitch - synthesizedPitch);
  const pitchSim = Math.max(0, 1 - pitchDelta / 50);

  const composite = profileSim * 0.7 + pitchSim * 0.3;
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
