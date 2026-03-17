import React, { useState } from 'react';
import { Trash2, Play, Clock, Activity } from 'lucide-react';
import { FrequencyProfile } from './FrequencyProfile';
import { deleteVoicePrint as deleteVP, getAudioBlob } from '../utils/storage';
import { blobToAudioBuffer } from '../utils/audioAnalyzer';
import { useI18n } from '../i18n';
import type { VoicePrint } from '../types';

interface VoicePrintsViewProps {
  voicePrints: VoicePrint[];
  onDeleted: (id: string) => void;
}

export function VoicePrintsView({ voicePrints, onDeleted }: VoicePrintsViewProps) {
  const { t } = useI18n();
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString('zh-CN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const handlePlay = async (vp: VoicePrint) => {
    if (playingId === vp.id) return;

    try {
      setPlayingId(vp.id);
      const blob = await getAudioBlob(vp.id);
      if (!blob) {
        console.error('No audio data found for voiceprint:', vp.id);
        setPlayingId(null);
        return;
      }
      const audioContext = new AudioContext();
      const audioBuffer = await blobToAudioBuffer(blob, audioContext);
      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContext.destination);
      source.onended = () => {
        setPlayingId(null);
        audioContext.close();
      };
      source.start();
    } catch (err) {
      console.error('Failed to play audio:', err);
      setPlayingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t('voiceprints.deleteConfirm'))) return;
    try {
      await deleteVP(id);
      onDeleted(id);
    } catch (err) {
      console.error('Failed to delete voiceprint:', err);
    }
  };

  if (voicePrints.length === 0) {
    return (
      <div className="text-center py-16">
        <Activity className="h-16 w-16 text-gray-300 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-gray-500">{t('voiceprints.emptyTitle')}</h3>
        <p className="text-gray-400 text-sm mt-1">{t('voiceprints.emptyState')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-900">{t('voiceprints.title')}</h2>
        <span className="text-sm text-gray-400">{t('voiceprints.count', { count: String(voicePrints.length) })}</span>
      </div>

      {voicePrints.map((vp) => (
        <div
          key={vp.id}
          className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden"
        >
          <div
            className="p-4 flex items-center justify-between cursor-pointer"
            onClick={() => setExpandedId(expandedId === vp.id ? null : vp.id)}
          >
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center">
                <Activity className="h-5 w-5 text-indigo-600" />
              </div>
              <div>
                <p className="font-semibold text-gray-900">{vp.name}</p>
                <div className="flex items-center space-x-2 text-xs text-gray-400">
                  <Clock className="h-3 w-3" />
                  <span>{formatDate(vp.createdAt)}</span>
                  <span>·</span>
                  <span>{vp.duration}s</span>
                  <span>·</span>
                  <span>{vp.averagePitch} Hz</span>
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handlePlay(vp);
                }}
                disabled={playingId === vp.id}
                className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors ${
                  playingId === vp.id
                    ? 'bg-indigo-100 animate-pulse'
                    : 'bg-gray-100 active:bg-gray-200'
                }`}
              >
                <Play className={`h-4 w-4 ${
                  playingId === vp.id ? 'text-indigo-600' : 'text-gray-600'
                }`} />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete(vp.id);
                }}
                className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center active:bg-red-100 transition-colors"
              >
                <Trash2 className="h-4 w-4 text-gray-400" />
              </button>
            </div>
          </div>

          {expandedId === vp.id && (
            <div className="px-4 pb-4 border-t border-gray-100 pt-3">
              <FrequencyProfile
                profile={vp.frequencyProfile}
                color="#6366f1"
                height={40}
                label={t('record.frequencyProfile')}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
