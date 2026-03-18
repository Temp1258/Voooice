import React, { useEffect, useState } from 'react';
import { BarChart3 } from 'lucide-react';
import { useI18n } from '../i18n';
import { extractFrequencyProfile, estimateAveragePitch, blobToAudioBuffer } from '../utils/audioAnalyzer';
import { computeVoiceSimilarity, getSimilarityLabel } from '../utils/voiceSimilarity';
import type { VoicePrint } from '../types';

interface VoiceSimilarityScoreProps {
  voicePrint: VoicePrint;
  synthesizedBlob: Blob;
}

export function VoiceSimilarityScore({ voicePrint, synthesizedBlob }: VoiceSimilarityScoreProps) {
  const { t } = useI18n();
  const [score, setScore] = useState<number | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

  useEffect(() => {
    if (!synthesizedBlob || synthesizedBlob.size === 0) return;

    let cancelled = false;
    setAnalyzing(true);

    (async () => {
      try {
        const audioContext = new AudioContext();
        const buffer = await blobToAudioBuffer(synthesizedBlob, audioContext);
        const synProfile = extractFrequencyProfile(buffer);
        const synPitch = estimateAveragePitch(buffer);
        await audioContext.close();

        if (cancelled) return;

        const originalProfile = voicePrint.frequencyProfile || [];
        const originalPitch = voicePrint.averagePitch || 150;

        const similarity = computeVoiceSimilarity(
          originalProfile,
          synProfile,
          originalPitch,
          synPitch,
        );

        setScore(similarity);
      } catch (err) {
        console.error('Similarity analysis failed:', err);
        setScore(null);
      } finally {
        if (!cancelled) setAnalyzing(false);
      }
    })();

    return () => { cancelled = true; };
  }, [voicePrint, synthesizedBlob]);

  if (analyzing) {
    return (
      <div className="bg-gray-50 rounded-xl p-3 flex items-center gap-2 animate-pulse">
        <BarChart3 className="h-4 w-4 text-gray-400" />
        <span className="text-sm text-gray-400">{t('similarity.analyzing')}</span>
      </div>
    );
  }

  if (score === null) return null;

  const { labelKey, color } = getSimilarityLabel(score);

  // Animated ring percentage
  const circumference = 2 * Math.PI * 20;
  const strokeDashoffset = circumference - (score / 100) * circumference;

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-4">
      <div className="flex items-center gap-4">
        {/* Circular score */}
        <div className="relative w-16 h-16 flex-shrink-0">
          <svg className="w-16 h-16 -rotate-90" viewBox="0 0 48 48">
            <circle cx="24" cy="24" r="20" fill="none" stroke="#e5e7eb" strokeWidth="3" />
            <circle
              cx="24" cy="24" r="20" fill="none"
              stroke={score >= 85 ? '#16a34a' : score >= 70 ? '#2563eb' : score >= 50 ? '#d97706' : '#ef4444'}
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              className="transition-all duration-1000"
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-gray-900">
            {score}
          </span>
        </div>

        {/* Labels */}
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-900">{t('similarity.title')}</p>
          <p className={`text-sm font-semibold ${color}`}>{t(labelKey)}</p>
          <p className="text-xs text-gray-400 mt-0.5">{t('similarity.description')}</p>
        </div>
      </div>
    </div>
  );
}
