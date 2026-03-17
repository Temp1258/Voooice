import React, { useState, useRef, useCallback } from 'react';
import { Send, Play, Pause, Sparkles, Gift, Heart, Star, Sun } from 'lucide-react';
import { useI18n } from '../i18n';
import { voiceCloneService } from '../services/voiceCloneService';
import { shareAudio, downloadBlob } from '../utils/audioExport';
import type { VoicePrint } from '../types';

interface VoiceCardViewProps {
  voicePrints: VoicePrint[];
}

const CARD_TEMPLATES = [
  { id: 'birthday', icon: Gift, color: 'from-pink-400 to-rose-500', bg: 'bg-pink-50' },
  { id: 'love', icon: Heart, color: 'from-red-400 to-pink-500', bg: 'bg-red-50' },
  { id: 'thanks', icon: Star, color: 'from-amber-400 to-orange-500', bg: 'bg-amber-50' },
  { id: 'greeting', icon: Sun, color: 'from-blue-400 to-indigo-500', bg: 'bg-blue-50' },
] as const;

type TemplateId = typeof CARD_TEMPLATES[number]['id'];

export function VoiceCardView({ voicePrints }: VoiceCardViewProps) {
  const { t } = useI18n();

  const [selectedVP, setSelectedVP] = useState<string>(voicePrints[0]?.id || '');
  const [template, setTemplate] = useState<TemplateId>('birthday');
  const [message, setMessage] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const selectedTemplate = CARD_TEMPLATES.find(t => t.id === template)!;

  const handleGenerate = useCallback(async () => {
    if (!message.trim() || !selectedVP) return;
    setIsGenerating(true);
    setAudioBlob(null);
    try {
      const vp = voicePrints.find(v => v.id === selectedVP);
      const blob = await voiceCloneService.synthesize(message.trim(), {
        voiceId: vp?.cloudVoiceId,
        language: vp?.language || 'zh-CN',
        emotion: 'happy',
        speed: 0.95,
      });
      if (blob) {
        setAudioBlob(blob);
      }
    } catch (err) {
      console.error('Failed to generate voice card:', err);
    } finally {
      setIsGenerating(false);
    }
  }, [message, selectedVP, voicePrints]);

  const handlePlay = useCallback(() => {
    if (!audioBlob) return;
    if (isPlaying && audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
      return;
    }
    const url = URL.createObjectURL(audioBlob);
    const audio = new Audio(url);
    audioRef.current = audio;
    audio.onended = () => {
      setIsPlaying(false);
      URL.revokeObjectURL(url);
    };
    audio.play();
    setIsPlaying(true);
  }, [audioBlob, isPlaying]);

  const handleShare = useCallback(async () => {
    if (!audioBlob) return;
    const vp = voicePrints.find(v => v.id === selectedVP);
    const timestamp = new Date().toISOString().slice(0, 10);
    const filename = `Voooice_Card_${timestamp}.wav`;
    const shared = await shareAudio(
      audioBlob,
      filename,
      t('voicecard.shareTitle'),
      t('voicecard.shareText', { name: vp?.name || 'Voooice' }),
    );
    if (!shared) {
      downloadBlob(audioBlob, filename);
    }
  }, [audioBlob, selectedVP, voicePrints, t]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="text-center">
        <h2 className="text-xl font-bold text-gray-900 mb-1">{t('voicecard.title')}</h2>
        <p className="text-gray-500 text-sm">{t('voicecard.subtitle')}</p>
      </div>

      {/* Template selector */}
      <div className="flex gap-3 justify-center">
        {CARD_TEMPLATES.map((tpl) => {
          const Icon = tpl.icon;
          return (
            <button
              key={tpl.id}
              onClick={() => setTemplate(tpl.id)}
              className={`w-16 h-16 rounded-2xl flex flex-col items-center justify-center gap-1 transition-all ${
                template === tpl.id
                  ? `bg-gradient-to-br ${tpl.color} text-white shadow-lg scale-105`
                  : `${tpl.bg} text-gray-500 active:scale-95`
              }`}
            >
              <Icon className="h-5 w-5" />
              <span className="text-[10px] font-medium">{t(`voicecard.template.${tpl.id}`)}</span>
            </button>
          );
        })}
      </div>

      {/* Card preview */}
      <div className={`rounded-2xl p-6 border border-gray-200 bg-gradient-to-br ${selectedTemplate.color} text-white shadow-lg`}>
        <div className="text-center space-y-3">
          {React.createElement(selectedTemplate.icon, { className: 'h-10 w-10 mx-auto opacity-80' })}
          <p className="text-lg font-medium leading-relaxed min-h-[3rem]">
            {message || t('voicecard.placeholder')}
          </p>
          <p className="text-sm opacity-70">—— Voooice</p>
        </div>
      </div>

      {/* Voice selector */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('voicecard.selectVoice')}</label>
        <select
          value={selectedVP}
          onChange={(e) => setSelectedVP(e.target.value)}
          className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
        >
          {voicePrints.map((vp) => (
            <option key={vp.id} value={vp.id}>{vp.name}</option>
          ))}
        </select>
      </div>

      {/* Message input */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('voicecard.messageLabel')}</label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={t('voicecard.messagePlaceholder')}
          maxLength={200}
          rows={3}
          className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm resize-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
        />
        <p className="text-xs text-gray-400 text-right mt-1">{message.length}/200</p>
      </div>

      {/* Generate button */}
      <button
        onClick={handleGenerate}
        disabled={!message.trim() || !selectedVP || isGenerating}
        className="w-full py-3.5 bg-indigo-600 text-white rounded-xl font-semibold flex items-center justify-center gap-2 disabled:opacity-50 active:bg-indigo-700 transition-colors"
      >
        <Sparkles className="h-5 w-5" />
        {isGenerating ? t('voicecard.generating') : t('voicecard.generate')}
      </button>

      {/* Audio controls */}
      {audioBlob && (
        <div className="bg-white rounded-2xl p-4 border border-gray-200 space-y-3">
          <div className="flex gap-3">
            <button
              onClick={handlePlay}
              className="flex-1 py-2.5 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium flex items-center justify-center gap-1.5 active:bg-gray-200"
            >
              {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              {isPlaying ? t('voicecard.pause') : t('voicecard.play')}
            </button>
            <button
              onClick={handleShare}
              className="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-medium flex items-center justify-center gap-1.5 active:bg-indigo-700"
            >
              <Send className="h-4 w-4" />
              {t('voicecard.share')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
