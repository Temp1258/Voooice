import { describe, it, expect } from 'vitest';
import { cosineSimilarity, computeVoiceSimilarity, getSimilarityLabel } from '../voiceSimilarity';

describe('cosineSimilarity', () => {
  it('should return 1 for identical vectors', () => {
    const a = [1, 2, 3, 4, 5];
    expect(cosineSimilarity(a, a)).toBeCloseTo(1.0);
  });

  it('should return 0 for orthogonal vectors', () => {
    const a = [1, 0, 0];
    const b = [0, 1, 0];
    expect(cosineSimilarity(a, b)).toBeCloseTo(0.0);
  });

  it('should return 0 for empty arrays', () => {
    expect(cosineSimilarity([], [])).toBe(0);
  });

  it('should handle different length arrays by using minimum length', () => {
    const a = [1, 2, 3];
    const b = [1, 2];
    // Only compares first 2 elements
    const result = cosineSimilarity(a, b);
    expect(result).toBeGreaterThan(0);
    expect(result).toBeLessThanOrEqual(1);
  });

  it('should return ~1 for scaled vectors', () => {
    const a = [1, 2, 3];
    const b = [2, 4, 6]; // 2x scale
    expect(cosineSimilarity(a, b)).toBeCloseTo(1.0);
  });
});

describe('computeVoiceSimilarity', () => {
  it('should return 100 for identical profiles and pitch', () => {
    const profile = [0.5, 0.8, 0.3, 0.6];
    const score = computeVoiceSimilarity(profile, profile, 200, 200);
    expect(score).toBe(100);
  });

  it('should return lower score for different profiles', () => {
    const a = [1, 0, 0, 0];
    const b = [0, 0, 0, 1];
    const score = computeVoiceSimilarity(a, b, 200, 200);
    // With MFCC + formant analysis, orthogonal profiles still produce
    // partial similarity. Score should be well below identical (100).
    expect(score).toBeLessThan(60);
    expect(score).toBeGreaterThan(0);
  });

  it('should penalize large pitch differences', () => {
    const profile = [0.5, 0.8, 0.3, 0.6];
    const same = computeVoiceSimilarity(profile, profile, 200, 200);
    const diff = computeVoiceSimilarity(profile, profile, 200, 300);
    expect(diff).toBeLessThan(same);
  });

  it('should clamp pitch penalty at 50Hz delta', () => {
    const profile = [0.5, 0.5, 0.5];
    const score50 = computeVoiceSimilarity(profile, profile, 200, 250);
    const score100 = computeVoiceSimilarity(profile, profile, 200, 300);
    // Both should have 0 pitch similarity since delta >= 50
    expect(score50).toBe(score100);
  });
});

describe('getSimilarityLabel', () => {
  it('should return excellent for score >= 85', () => {
    expect(getSimilarityLabel(90).labelKey).toBe('similarity.excellent');
  });

  it('should return good for score 70-84', () => {
    expect(getSimilarityLabel(75).labelKey).toBe('similarity.good');
  });

  it('should return fair for score 50-69', () => {
    expect(getSimilarityLabel(55).labelKey).toBe('similarity.fair');
  });

  it('should return needsWork for score < 50', () => {
    expect(getSimilarityLabel(30).labelKey).toBe('similarity.needsWork');
  });

  it('should return correct color classes', () => {
    expect(getSimilarityLabel(90).color).toContain('green');
    expect(getSimilarityLabel(75).color).toContain('blue');
    expect(getSimilarityLabel(55).color).toContain('amber');
    expect(getSimilarityLabel(30).color).toContain('red');
  });
});
