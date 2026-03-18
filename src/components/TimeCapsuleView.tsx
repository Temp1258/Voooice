import React, { useState, useEffect, useCallback } from 'react';
import { Clock, Lock, Unlock, Play, Pause, Trash2, Plus, Sparkles } from 'lucide-react';
import { useI18n } from '../i18n';
import { voiceCloneService } from '../services/voiceCloneService';
import type { VoicePrint } from '../types';

interface TimeCapsule {
  id: string;
  voiceId: string;
  voiceName: string;
  message: string;
  audioData?: string; // base64 encoded
  createdAt: number;
  unlockAt: number;
  isUnlocked: boolean;
}

const STORAGE_KEY = 'voooice_time_capsules';

function loadCapsules(): TimeCapsule[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return [];
    const capsules: TimeCapsule[] = JSON.parse(data);
    // Auto-unlock capsules that have passed their unlock time
    return capsules.map(c => ({
      ...c,
      isUnlocked: c.isUnlocked || Date.now() >= c.unlockAt,
    }));
  } catch {
    return [];
  }
}

function saveCapsules(capsules: TimeCapsule[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(capsules));
}

interface TimeCapsuleViewProps {
  voicePrints: VoicePrint[];
}

export function TimeCapsuleView({ voicePrints }: TimeCapsuleViewProps) {
  const { t } = useI18n();
  const [capsules, setCapsules] = useState<TimeCapsule[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = React.useRef<HTMLAudioElement | null>(null);

  // Form state
  const [selectedVP, setSelectedVP] = useState(voicePrints[0]?.id || '');
  const [message, setMessage] = useState('');
  const [unlockDays, setUnlockDays] = useState(7);
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    setCapsules(loadCapsules());
  }, []);

  // Periodically check for newly unlocked capsules
  useEffect(() => {
    const interval = setInterval(() => {
      setCapsules(prev => {
        const now = Date.now();
        let changed = false;
        const updated = prev.map(c => {
          if (!c.isUnlocked && now >= c.unlockAt) {
            changed = true;
            return { ...c, isUnlocked: true };
          }
          return c;
        });
        if (changed) {
          saveCapsules(updated);
          return updated;
        }
        return prev;
      });
    }, 60000); // check every minute
    return () => clearInterval(interval);
  }, []);

  const handleCreate = useCallback(async () => {
    if (!message.trim() || !selectedVP) return;
    setIsCreating(true);

    try {
      const vp = voicePrints.find(v => v.id === selectedVP);
      let audioData: string | undefined;

      try {
        const voiceId = vp?.cloudVoiceId || selectedVP;
        const blob = await voiceCloneService.synthesize(message.trim(), voiceId, {
          language: vp?.language || 'zh-CN',
          emotion: 'calm',
          speed: 0.95,
          stability: 0.6,
          similarity: 0.8,
        });
        if (blob && blob.size > 0) {
          const buffer = await blob.arrayBuffer();
          const bytes = new Uint8Array(buffer);
          let binary = '';
          for (let i = 0; i < bytes.length; i++) {
            binary += String.fromCharCode(bytes[i]);
          }
          audioData = btoa(binary);
        }
      } catch {
        // Continue without audio — the message itself is valuable
      }

      const capsule: TimeCapsule = {
        id: `tc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        voiceId: selectedVP,
        voiceName: vp?.name || '',
        message: message.trim(),
        audioData,
        createdAt: Date.now(),
        unlockAt: Date.now() + unlockDays * 24 * 60 * 60 * 1000,
        isUnlocked: false,
      };

      const updated = [capsule, ...capsules];
      setCapsules(updated);
      saveCapsules(updated);
      setMessage('');
      setShowCreate(false);
    } catch (err) {
      console.error('Failed to create time capsule:', err);
    } finally {
      setIsCreating(false);
    }
  }, [message, selectedVP, unlockDays, capsules, voicePrints]);

  const handleDelete = useCallback((id: string) => {
    const updated = capsules.filter(c => c.id !== id);
    setCapsules(updated);
    saveCapsules(updated);
  }, [capsules]);

  const handlePlay = useCallback((capsule: TimeCapsule) => {
    if (!capsule.audioData || !capsule.isUnlocked) return;

    if (playingId === capsule.id && audioRef.current) {
      audioRef.current.pause();
      setPlayingId(null);
      return;
    }

    const binary = atob(capsule.audioData);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    // Detect format from magic bytes: MP3 starts with 0xFF 0xFB or "ID3"
    const isMP3 = (bytes[0] === 0xFF && (bytes[1] & 0xE0) === 0xE0) ||
                  (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33);
    const mimeType = isMP3 ? 'audio/mpeg' : 'audio/wav';
    const blob = new Blob([bytes], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audioRef.current = audio;
    audio.onended = () => {
      setPlayingId(null);
      URL.revokeObjectURL(url);
    };
    audio.onerror = () => {
      setPlayingId(null);
      URL.revokeObjectURL(url);
    };
    audio.play().catch(() => {
      setPlayingId(null);
      URL.revokeObjectURL(url);
    });
    setPlayingId(capsule.id);
  }, [playingId]);

  const formatCountdown = (unlockAt: number): string => {
    const diff = unlockAt - Date.now();
    if (diff <= 0) return t('timecapsule.ready');
    const days = Math.floor(diff / (24 * 60 * 60 * 1000));
    const hours = Math.floor((diff % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
    if (days > 0) return t('timecapsule.countdown', { days: String(days), hours: String(hours) });
    return t('timecapsule.countdownHours', { hours: String(hours) });
  };

  return (
    <div className="space-y-5">
      <div className="text-center">
        <h2 className="text-xl font-bold text-gray-900 mb-1">{t('timecapsule.title')}</h2>
        <p className="text-gray-500 text-sm">{t('timecapsule.subtitle')}</p>
      </div>

      {/* Create button */}
      <button
        onClick={() => setShowCreate(true)}
        className="w-full py-3.5 bg-indigo-600 text-white rounded-xl font-semibold flex items-center justify-center gap-2 active:bg-indigo-700"
      >
        <Plus className="h-5 w-5" />
        {t('timecapsule.create')}
      </button>

      {/* Create form */}
      {showCreate && (
        <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('timecapsule.selectVoice')}</label>
            <select
              value={selectedVP}
              onChange={(e) => setSelectedVP(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm bg-white"
            >
              {voicePrints.map((vp) => (
                <option key={vp.id} value={vp.id}>{vp.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('timecapsule.messageLabel')}</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={t('timecapsule.messagePlaceholder')}
              rows={4}
              maxLength={300}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm resize-none"
            />
            <p className="text-xs text-gray-400 text-right mt-1">{message.length}/300</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('timecapsule.unlockAfter')}</label>
            <div className="flex gap-2">
              {[1, 7, 30, 90, 365].map((days) => (
                <button
                  key={days}
                  onClick={() => setUnlockDays(days)}
                  className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all ${
                    unlockDays === days
                      ? 'bg-indigo-600 text-white'
                      : 'bg-gray-50 text-gray-600 active:bg-gray-100'
                  }`}
                >
                  {days < 30
                    ? t('timecapsule.days', { n: String(days) })
                    : days < 365
                      ? t('timecapsule.months', { n: String(Math.round(days / 30)) })
                      : t('timecapsule.year')}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => setShowCreate(false)}
              className="flex-1 py-2.5 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium"
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={handleCreate}
              disabled={!message.trim() || !selectedVP || isCreating}
              className="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-1.5"
            >
              <Sparkles className="h-4 w-4" />
              {isCreating ? t('timecapsule.creating') : t('timecapsule.seal')}
            </button>
          </div>
        </div>
      )}

      {/* Capsule list */}
      {capsules.length === 0 && !showCreate ? (
        <div className="text-center py-12">
          <Clock className="h-16 w-16 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-400">{t('timecapsule.empty')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {capsules.map((capsule) => (
            <div
              key={capsule.id}
              className={`rounded-2xl border p-4 transition-all ${
                capsule.isUnlocked
                  ? 'bg-white border-green-200'
                  : 'bg-gray-50 border-gray-200'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  {capsule.isUnlocked ? (
                    <Unlock className="h-5 w-5 text-green-500 flex-shrink-0" />
                  ) : (
                    <Lock className="h-5 w-5 text-gray-400 flex-shrink-0" />
                  )}
                  <div>
                    <p className="text-sm font-medium text-gray-900">{capsule.voiceName}</p>
                    <p className="text-xs text-gray-400">
                      {new Date(capsule.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(capsule.id)}
                  className="p-1.5 text-gray-300 active:text-red-500"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>

              {capsule.isUnlocked ? (
                <div className="mt-3 space-y-2">
                  <p className="text-sm text-gray-700 leading-relaxed">{capsule.message}</p>
                  {capsule.audioData && (
                    <button
                      onClick={() => handlePlay(capsule)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-green-50 text-green-700 rounded-lg text-sm font-medium active:bg-green-100"
                    >
                      {playingId === capsule.id ? (
                        <Pause className="h-4 w-4" />
                      ) : (
                        <Play className="h-4 w-4" />
                      )}
                      {playingId === capsule.id ? t('timecapsule.pause') : t('timecapsule.play')}
                    </button>
                  )}
                </div>
              ) : (
                <div className="mt-3">
                  <div className="bg-gray-100 rounded-xl p-3 text-center">
                    <Lock className="h-5 w-5 text-gray-400 mx-auto mb-1" />
                    <p className="text-sm text-gray-500 font-medium">
                      {formatCountdown(capsule.unlockAt)}
                    </p>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
