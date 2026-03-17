import React from 'react';
import { Star } from 'lucide-react';

export function getQualityStars(completedCount: number): number {
  if (completedCount >= 41) return 5;
  if (completedCount >= 31) return 4;
  if (completedCount >= 21) return 3;
  if (completedCount >= 11) return 2;
  if (completedCount >= 1) return 1;
  return 0;
}

export function getSupportedMimeType(): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  const candidates = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'];
  for (const mime of candidates) {
    if (MediaRecorder.isTypeSupported(mime)) return mime;
  }
  return null;
}

export function StarRating({ stars, max = 5 }: { stars: number; max?: number }) {
  return (
    <span className="inline-flex gap-0.5">
      {Array.from({ length: max }).map((_, i) => (
        <Star
          key={i}
          className={`h-4 w-4 ${i < stars ? 'text-amber-400 fill-amber-400' : 'text-gray-300'}`}
        />
      ))}
    </span>
  );
}

export interface PromptItem {
  key: string;
  category: string;
  categoryKey: string;
}

export const ALL_PROMPTS: PromptItem[] = (() => {
  const categories = [
    { category: 'daily', categoryKey: 'voicebank.category.daily', prefix: 'voicebank.prompt.daily' },
    { category: 'emotional', categoryKey: 'voicebank.category.emotional', prefix: 'voicebank.prompt.emotional' },
    { category: 'narrative', categoryKey: 'voicebank.category.narrative', prefix: 'voicebank.prompt.narrative' },
    { category: 'clarity', categoryKey: 'voicebank.category.clarity', prefix: 'voicebank.prompt.clarity' },
    { category: 'personal', categoryKey: 'voicebank.category.personal', prefix: 'voicebank.prompt.personal' },
  ];
  const prompts: PromptItem[] = [];
  for (const cat of categories) {
    for (let i = 1; i <= 10; i++) {
      prompts.push({ key: `${cat.prefix}${i}`, category: cat.category, categoryKey: cat.categoryKey });
    }
  }
  return prompts;
})();

export const LEGACY_KEY = 'vocaltext_voice_legacy';
