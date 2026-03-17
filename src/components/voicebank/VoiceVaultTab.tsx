import React, { useState, useCallback } from 'react';
import { Shield, Mail, Heart, Volume2, Send } from 'lucide-react';
import { useI18n } from '../../i18n';
import { getAudioBlob } from '../../utils/storage';
import { voiceCloneService } from '../../services/voiceCloneService';
import type { VoicePrint } from '../../types';
import { getQualityStars, StarRating } from './shared';

export function VoiceVaultTab({ voicePrints }: { voicePrints: VoicePrint[] }) {
  const { t } = useI18n();
  const [letterTarget, setLetterTarget] = useState<string | null>(null);
  const [letterText, setLetterText] = useState('');
  const [playingId, setPlayingId] = useState<string | null>(null);

  const playVoicePrint = useCallback(async (vp: VoicePrint, text: string) => {
    if (vp.hasAudioBlob) {
      try {
        const blob = await getAudioBlob(vp.id);
        if (blob && blob.size > 0) {
          const url = URL.createObjectURL(blob);
          const audio = new Audio(url);
          setPlayingId(vp.id);
          audio.onended = () => { setPlayingId(null); URL.revokeObjectURL(url); };
          audio.onerror = () => { setPlayingId(null); URL.revokeObjectURL(url); };
          await audio.play();
          return;
        }
      } catch { /* fall through */ }
    }

    if (vp.cloudVoiceId) {
      try {
        setPlayingId(vp.id);
        const audioBlob = await voiceCloneService.synthesize(text, vp.cloudVoiceId, {
          language: vp.language || 'zh-CN', emotion: 'neutral', speed: 1.0, stability: 0.5, similarity: 0.75,
        });
        if (audioBlob.size > 0) {
          const url = URL.createObjectURL(audioBlob);
          const audio = new Audio(url);
          audio.onended = () => { setPlayingId(null); URL.revokeObjectURL(url); };
          await audio.play();
          return;
        }
      } catch { /* fall through */ }
    }

    setPlayingId(vp.id);
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = vp.language || 'zh-CN';
    utterance.onend = () => setPlayingId(null);
    speechSynthesis.speak(utterance);
  }, []);

  if (voicePrints.length === 0) {
    return (
      <div className="bg-white rounded-2xl p-8 text-center border border-gray-200 space-y-3">
        <Heart className="h-16 w-16 text-rose-300 mx-auto" />
        <h3 className="text-lg font-semibold text-gray-700">{t('voicebank.vault.empty')}</h3>
        <p className="text-sm text-gray-400">{t('voicebank.vault.emptySubtext')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {voicePrints.map((vp) => {
        const stars = getQualityStars(Math.min(50, Math.ceil(vp.duration / 5)));
        const dateStr = new Date(vp.createdAt).toLocaleDateString();
        const isLetterOpen = letterTarget === vp.id;

        return (
          <div key={vp.id} className="bg-white rounded-2xl p-4 border border-gray-200 space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <h4 className="font-semibold text-gray-900">{vp.name}</h4>
                <p className="text-xs text-gray-400 mt-0.5">{t('voicebank.vault.recordedOn', { date: dateStr })}</p>
              </div>
              {vp.encryptionIv && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-green-100 text-green-700">
                  <Shield className="h-3 w-3" />
                  {t('voicebank.vault.encrypted')}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">{t('voicebank.vault.quality')}</span>
              <StarRating stars={stars} />
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => playVoicePrint(vp, t('voicebank.vault.testPhrase'))}
                disabled={playingId === vp.id}
                className="flex items-center gap-1.5 px-3 py-2 bg-rose-50 text-rose-600 rounded-xl text-xs font-medium active:bg-rose-100 disabled:opacity-50"
              >
                <Volume2 className="h-3.5 w-3.5" />
                {playingId === vp.id ? t('speak.playing') : t('voicebank.vault.listen')}
              </button>
              <button
                onClick={() => { setLetterTarget(isLetterOpen ? null : vp.id); setLetterText(''); }}
                className="flex items-center gap-1.5 px-3 py-2 bg-indigo-50 text-indigo-600 rounded-xl text-xs font-medium active:bg-indigo-100"
              >
                <Mail className="h-3.5 w-3.5" />
                {t('voicebank.vault.writeLetter')}
              </button>
            </div>

            {isLetterOpen && (
              <div className="space-y-2 pt-1">
                <textarea
                  value={letterText}
                  onChange={(e) => setLetterText(e.target.value)}
                  placeholder={t('voicebank.vault.letterPlaceholder')}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm resize-none h-24 focus:ring-2 focus:ring-rose-500 focus:border-transparent"
                />
                <button
                  onClick={() => { if (letterText.trim()) playVoicePrint(vp, letterText); }}
                  disabled={!letterText.trim() || playingId === vp.id}
                  className="flex items-center gap-1.5 px-4 py-2 bg-rose-500 text-white rounded-xl text-sm font-medium disabled:opacity-50 active:bg-rose-600"
                >
                  <Send className="h-4 w-4" />
                  {t('voicebank.vault.synthesize')}
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
