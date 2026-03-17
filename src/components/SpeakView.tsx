import React, { useState, useRef } from 'react';
import { Volume2, AlertCircle, ChevronDown, Activity, Smile, Frown, Zap, Heart, Wind, Minus, Download, Share2 } from 'lucide-react';
import { getAudioBlob } from '../utils/storage';
import { blobToAudioBuffer } from '../utils/audioAnalyzer';
import { voiceCloneService } from '../services/voiceCloneService';
import { downloadBlob, shareAudio } from '../utils/audioExport';
import { useI18n } from '../i18n';
import type { VoicePrint, SpeakingState, EmotionType } from '../types';

interface SpeakViewProps {
  voicePrints: VoicePrint[];
}

const LANGUAGES = [
  { code: 'zh-CN', label: '中文' },
  { code: 'en-US', label: 'English' },
  { code: 'ja-JP', label: '日本語' },
  { code: 'ko-KR', label: '한국어' },
];

export function SpeakView({ voicePrints }: SpeakViewProps) {
  const { t } = useI18n();

  const EMOTIONS: { value: EmotionType; label: string; icon: React.ReactNode }[] = [
    { value: 'neutral', label: t('speak.emotionNeutral'), icon: <Minus className="h-4 w-4" /> },
    { value: 'happy', label: t('speak.emotionHappy'), icon: <Smile className="h-4 w-4" /> },
    { value: 'sad', label: t('speak.emotionSad'), icon: <Frown className="h-4 w-4" /> },
    { value: 'excited', label: t('speak.emotionExcited'), icon: <Zap className="h-4 w-4" /> },
    { value: 'calm', label: t('speak.emotionCalm'), icon: <Heart className="h-4 w-4" /> },
    { value: 'angry', label: t('speak.emotionAngry'), icon: <Wind className="h-4 w-4" /> },
  ];
  const [selectedVPId, setSelectedVPId] = useState<string>(voicePrints[0]?.id || '');
  const [text, setText] = useState('');
  const [speakingState, setSpeakingState] = useState<SpeakingState>('idle');
  const [showDropdown, setShowDropdown] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emotion, setEmotion] = useState<EmotionType>('neutral');
  const [language, setLanguage] = useState('zh-CN');
  const [speed, setSpeed] = useState(1.0);
  const [stability, setStability] = useState(0.5);
  const [similarity, setSimilarity] = useState(0.75);
  const [lastSynthesizedBlob, setLastSynthesizedBlob] = useState<Blob | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);

  const selectedVP = voicePrints.find(vp => vp.id === selectedVPId);

  const handleSynthesize = async () => {
    if (!text.trim() || !selectedVP) return;

    setError(null);
    setSpeakingState('synthesizing');

    try {
      const voiceId = selectedVP.cloudVoiceId || selectedVP.id;

      const audioBlob = await voiceCloneService.synthesize(text, voiceId, {
        language,
        emotion,
        speed,
        stability,
        similarity,
      });

      setLastSynthesizedBlob(audioBlob);

      // If the blob has data, play it directly
      if (audioBlob.size > 0) {
        const audioContext = new AudioContext();
        audioContextRef.current = audioContext;
        const buffer = await audioContext.decodeAudioData(await audioBlob.arrayBuffer());
        const source = audioContext.createBufferSource();
        source.buffer = buffer;
        source.connect(audioContext.destination);
        sourceRef.current = source;
        source.onended = () => {
          setSpeakingState('idle');
          audioContext.close();
        };
        setSpeakingState('speaking');
        source.start();
      } else {
        // Web Speech fallback already played it via utterance
        setSpeakingState('speaking');
        // Monitor speechSynthesis for end
        const checkDone = setInterval(() => {
          if (!speechSynthesis.speaking) {
            clearInterval(checkDone);
            setSpeakingState('idle');
          }
        }, 200);
      }
    } catch (err: any) {
      console.error('Synthesis failed:', err);
      setError(t('error.synthesisFailed') + ': ' + (err.message || t('error.unknown')));
      setSpeakingState('error');
    }
  };

  const handlePlayOriginal = async () => {
    if (!selectedVP) return;
    try {
      const blob = await getAudioBlob(selectedVP.id);
      if (!blob) return;
      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      const buffer = await blobToAudioBuffer(blob, audioContext);
      const source = audioContext.createBufferSource();
      source.buffer = buffer;
      source.connect(audioContext.destination);
      sourceRef.current = source;
      source.onended = () => audioContext.close();
      source.start();
    } catch (err) {
      console.error('Failed to play original:', err);
    }
  };

  const handleStop = () => {
    speechSynthesis.cancel();
    if (sourceRef.current) {
      try { sourceRef.current.stop(); } catch {}
    }
    setSpeakingState('idle');
  };

  if (voicePrints.length === 0) {
    return (
      <div className="text-center py-16">
        <Volume2 className="h-16 w-16 text-gray-300 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-gray-500">{t('speak.noVoiceprints')}</h3>
        <p className="text-gray-400 text-sm mt-1">{t('speak.noVoiceprintsHint')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="text-center">
        <h2 className="text-xl font-bold text-gray-900 mb-1">{t('speak.title')}</h2>
        <p className="text-gray-500 text-sm">{t('speak.description')}</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start space-x-3">
          <AlertCircle className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Voice selection */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4">
        <label className="text-sm font-medium text-gray-700 mb-2 block" id="voice-select-label">{t('speak.selectVoice')}</label>
        <div className="relative">
          <button
            onClick={() => setShowDropdown(!showDropdown)}
            className="w-full border border-gray-300 rounded-xl px-4 py-3 text-left flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-indigo-500"
            aria-labelledby="voice-select-label"
          >
            {selectedVP ? (
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center">
                  <Activity className="h-4 w-4 text-indigo-600" />
                </div>
                <div>
                  <p className="font-medium text-gray-900">{selectedVP.name}</p>
                  <p className="text-xs text-gray-400">{selectedVP.averagePitch} Hz · {selectedVP.duration}s</p>
                </div>
              </div>
            ) : (
              <span className="text-gray-400">{t('speak.selectVoice')}</span>
            )}
            <ChevronDown className="h-5 w-5 text-gray-400" />
          </button>

          {showDropdown && (
            <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
              {voicePrints.map((vp) => (
                <button
                  key={vp.id}
                  onClick={() => { setSelectedVPId(vp.id); setShowDropdown(false); }}
                  className={`w-full px-4 py-3 text-left flex items-center space-x-3 transition-colors ${
                    vp.id === selectedVPId ? 'bg-indigo-50' : 'active:bg-gray-100'
                  }`}
                >
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                    vp.id === selectedVPId ? 'bg-indigo-200' : 'bg-gray-100'
                  }`}>
                    <Activity className={`h-4 w-4 ${vp.id === selectedVPId ? 'text-indigo-600' : 'text-gray-500'}`} />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">{vp.name}</p>
                    <p className="text-xs text-gray-400">{vp.averagePitch} Hz</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {selectedVP && (
          <button
            onClick={handlePlayOriginal}
            className="mt-3 text-sm text-indigo-600 flex items-center space-x-1 active:text-indigo-800"
            aria-label={t('speak.previewOriginal')}
          >
            <Volume2 className="h-4 w-4" />
            <span>{t('speak.previewOriginal')}</span>
          </button>
        )}
      </div>

      {/* Emotion selection */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4">
        <label className="text-sm font-medium text-gray-700 mb-3 block">{t('speak.emotionLabel')}</label>
        <div className="grid grid-cols-3 gap-2">
          {EMOTIONS.map(({ value, label, icon }) => (
            <button
              key={value}
              onClick={() => setEmotion(value)}
              className={`flex items-center justify-center space-x-1.5 py-2 rounded-xl text-sm font-medium transition-colors ${
                emotion === value
                  ? 'bg-indigo-100 text-indigo-700 border-2 border-indigo-300'
                  : 'bg-gray-50 text-gray-600 border-2 border-transparent active:bg-gray-100'
              }`}
              aria-pressed={emotion === value}
            >
              {icon}
              <span>{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Language & Speed */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4 space-y-4">
        <div>
          <label className="text-sm font-medium text-gray-700 mb-1 block" htmlFor="lang-select">{t('speak.languageSelection')}</label>
          <select
            id="lang-select"
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {LANGUAGES.map(l => (
              <option key={l.code} value={l.code}>{l.label}</option>
            ))}
          </select>
        </div>
        <div>
          <div className="flex justify-between items-center mb-1">
            <label className="text-sm font-medium text-gray-700" htmlFor="speed-range">{t('speak.speed')}</label>
            <span className="text-xs text-gray-400">{speed.toFixed(1)}x</span>
          </div>
          <input
            id="speed-range"
            type="range"
            min="0.5"
            max="2.0"
            step="0.1"
            value={speed}
            onChange={(e) => setSpeed(parseFloat(e.target.value))}
            className="w-full accent-indigo-600"
          />
        </div>
        <div>
          <div className="flex justify-between items-center mb-1">
            <label className="text-sm font-medium text-gray-700" htmlFor="stability-range">{t('speak.stability')}</label>
            <span className="text-xs text-gray-400">{(stability * 100).toFixed(0)}%</span>
          </div>
          <input
            id="stability-range"
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={stability}
            onChange={(e) => setStability(parseFloat(e.target.value))}
            className="w-full accent-indigo-600"
          />
        </div>
        <div>
          <div className="flex justify-between items-center mb-1">
            <label className="text-sm font-medium text-gray-700" htmlFor="similarity-range">{t('speak.similarity')}</label>
            <span className="text-xs text-gray-400">{(similarity * 100).toFixed(0)}%</span>
          </div>
          <input
            id="similarity-range"
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={similarity}
            onChange={(e) => setSimilarity(parseFloat(e.target.value))}
            className="w-full accent-indigo-600"
          />
        </div>
      </div>

      {/* Text input */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4">
        <label className="text-sm font-medium text-gray-700 mb-2 block" htmlFor="tts-text">{t('speak.inputText')}</label>
        <textarea
          id="tts-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t('speak.placeholder')}
          className="w-full border border-gray-300 rounded-xl px-4 py-3 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
          rows={4}
          maxLength={500}
        />
        <div className="flex justify-end mt-1">
          <span className="text-xs text-gray-400">{text.length}/500</span>
        </div>
      </div>

      {/* Synthesize button */}
      {speakingState === 'speaking' || speakingState === 'synthesizing' ? (
        <button
          onClick={handleStop}
          className="w-full bg-red-500 text-white rounded-xl py-4 font-semibold flex items-center justify-center space-x-2 active:bg-red-600 transition-colors"
          aria-label={t('speak.stop')}
        >
          <Volume2 className="h-5 w-5 animate-pulse" />
          <span>{speakingState === 'synthesizing' ? t('speak.synthesizing') : t('speak.playingClickStop')}</span>
        </button>
      ) : (
        <button
          onClick={handleSynthesize}
          disabled={!text.trim() || !selectedVPId}
          className="w-full bg-indigo-600 text-white rounded-xl py-4 font-semibold flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed active:bg-indigo-700 transition-colors"
          aria-label={t('speak.synthesize')}
        >
          <Volume2 className="h-5 w-5" />
          <span>{t('speak.synthesize')}</span>
        </button>
      )}

      {/* Export / Share buttons */}
      {lastSynthesizedBlob && lastSynthesizedBlob.size > 0 && speakingState === 'idle' && (
        <div className="flex space-x-3">
          <button
            onClick={() => {
              const timestamp = new Date().toISOString().slice(0, 10);
              downloadBlob(lastSynthesizedBlob, `Voooice_${timestamp}.wav`);
            }}
            className="flex-1 py-2.5 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium flex items-center justify-center space-x-1.5 active:bg-gray-200"
          >
            <Download className="h-4 w-4" />
            <span>{t('common.export')}</span>
          </button>
          <button
            onClick={() => {
              const timestamp = new Date().toISOString().slice(0, 10);
              shareAudio(lastSynthesizedBlob, `Voooice_${timestamp}.wav`, selectedVP?.name || 'Voooice');
            }}
            className="flex-1 py-2.5 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium flex items-center justify-center space-x-1.5 active:bg-gray-200"
          >
            <Share2 className="h-4 w-4" />
            <span>{t('common.share')}</span>
          </button>
        </div>
      )}

      <div className="bg-amber-50 rounded-xl p-4 text-sm text-amber-700">
        <p className="font-medium mb-1">{t('speak.aboutCloningTitle')}</p>
        <p>
          {t('speak.aboutCloningNote')}
        </p>
      </div>
    </div>
  );
}
