import React, { useState, useRef, useCallback } from 'react';
import { Send, Play, Pause, Sparkles, Gift, Heart, Star, Sun, Music } from 'lucide-react';
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

const BGM_STYLES = [
  { id: 'none', labelKey: 'voicecard.bgm.none' },
  { id: 'warm', labelKey: 'voicecard.bgm.warm' },
  { id: 'festive', labelKey: 'voicecard.bgm.festive' },
  { id: 'calm', labelKey: 'voicecard.bgm.calm' },
] as const;

type BgmStyle = typeof BGM_STYLES[number]['id'];

/**
 * Generate a simple ambient background tone using Web Audio API.
 * Returns an AudioBuffer with soft pad-like tones.
 */
function generateBgmBuffer(
  style: BgmStyle,
  duration: number,
  sampleRate = 44100,
): AudioBuffer {
  const ctx = new OfflineAudioContext(1, sampleRate * duration, sampleRate);
  const buffer = ctx.createBuffer(1, sampleRate * duration, sampleRate);
  const data = buffer.getChannelData(0);

  const chords: Record<string, number[]> = {
    warm: [261.6, 329.6, 392.0],     // C major
    festive: [293.7, 370.0, 440.0],  // D major
    calm: [220.0, 277.2, 330.0],     // A minor
  };

  const freqs = chords[style] || chords.warm;
  const amplitude = 0.04; // Very quiet background

  for (let i = 0; i < data.length; i++) {
    const t = i / sampleRate;
    let sample = 0;
    for (const freq of freqs) {
      // Soft sine pad with slow amplitude modulation
      sample += Math.sin(2 * Math.PI * freq * t) * (0.5 + 0.5 * Math.sin(0.3 * t));
    }
    // Fade in/out
    const fadeIn = Math.min(1, t / 0.5);
    const fadeOut = Math.min(1, (duration - t) / 0.5);
    data[i] = sample * amplitude * fadeIn * fadeOut / freqs.length;
  }

  return buffer;
}

export function VoiceCardView({ voicePrints }: VoiceCardViewProps) {
  const { t } = useI18n();

  const [selectedVP, setSelectedVP] = useState<string>(voicePrints[0]?.id || '');
  const [template, setTemplate] = useState<TemplateId>('birthday');
  const [message, setMessage] = useState('');
  const [bgm, setBgm] = useState<BgmStyle>('none');
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
      const voiceId = vp?.cloudVoiceId || selectedVP;
      const blob = await voiceCloneService.synthesize(message.trim(), voiceId, {
        language: vp?.language || 'zh-CN',
        emotion: 'happy',
        speed: 0.95,
        stability: 0.5,
        similarity: 0.75,
      });
      if (blob && blob.size > 0 && bgm !== 'none') {
        // Mix voice with background music
        try {
          const audioContext = new AudioContext();
          const voiceBuffer = await audioContext.decodeAudioData(await blob.arrayBuffer());
          const bgmBuffer = generateBgmBuffer(bgm, voiceBuffer.duration + 1, voiceBuffer.sampleRate);

          // Create mixed output
          const mixLength = Math.max(voiceBuffer.length, bgmBuffer.length);
          const mixBuffer = audioContext.createBuffer(1, mixLength, voiceBuffer.sampleRate);
          const mixData = mixBuffer.getChannelData(0);
          const voiceData = voiceBuffer.getChannelData(0);
          const bgmData = bgmBuffer.getChannelData(0);

          for (let i = 0; i < mixLength; i++) {
            const v = i < voiceData.length ? voiceData[i] : 0;
            const b = i < bgmData.length ? bgmData[i] : 0;
            mixData[i] = Math.max(-1, Math.min(1, v + b));
          }

          // Encode to WAV blob
          const { audioBufferToWav } = await import('../utils/audioExport');
          const mixedBlob = audioBufferToWav(mixBuffer);
          await audioContext.close();
          setAudioBlob(mixedBlob);
        } catch {
          // Fallback to voice only
          setAudioBlob(blob);
        }
      } else if (blob) {
        setAudioBlob(blob);
      }
    } catch (err) {
      console.error('Failed to generate voice card:', err);
    } finally {
      setIsGenerating(false);
    }
  }, [message, selectedVP, voicePrints, bgm]);

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
    audio.onerror = () => {
      setIsPlaying(false);
      URL.revokeObjectURL(url);
    };
    audio.play().catch(() => {
      setIsPlaying(false);
      URL.revokeObjectURL(url);
    });
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

      {/* Background music */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          <Music className="h-4 w-4 inline mr-1" />
          {t('voicecard.bgmLabel')}
        </label>
        <div className="flex gap-2">
          {BGM_STYLES.map((s) => (
            <button
              key={s.id}
              onClick={() => setBgm(s.id)}
              className={`flex-1 py-2 rounded-xl text-xs font-medium transition-all ${
                bgm === s.id
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-50 text-gray-600 active:bg-gray-100'
              }`}
            >
              {t(s.labelKey)}
            </button>
          ))}
        </div>
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
