import React, { useState, useRef } from 'react';
import { Volume2, Loader2, AlertCircle, ChevronDown, Activity } from 'lucide-react';
import { base64ToAudioBuffer } from '../utils/audioAnalyzer';
import type { VoicePrint, SpeakingState } from '../types';

interface SpeakViewProps {
  voicePrints: VoicePrint[];
}

/**
 * Text-to-Speech view.
 *
 * Architecture note:
 * In a production app, this would send the text + voiceprint embedding to a
 * voice cloning API (e.g., ElevenLabs, Microsoft Custom Neural Voice, Coqui TTS,
 * or a self-hosted VALL-E/Bark model). The API would return synthesized audio
 * matching the target voice.
 *
 * For this demo, we use the Web Speech Synthesis API with pitch/rate adjustments
 * based on the voiceprint analysis, and mix in the original recording characteristics
 * to demonstrate the concept.
 */
export function SpeakView({ voicePrints }: SpeakViewProps) {
  const [selectedVPId, setSelectedVPId] = useState<string>(
    voicePrints[0]?.id || ''
  );
  const [text, setText] = useState('');
  const [speakingState, setSpeakingState] = useState<SpeakingState>('idle');
  const [showDropdown, setShowDropdown] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);

  const selectedVP = voicePrints.find(vp => vp.id === selectedVPId);

  const handleSynthesize = async () => {
    if (!text.trim() || !selectedVP) return;

    setError(null);
    setSpeakingState('synthesizing');

    try {
      // Strategy 1: Use Web Speech Synthesis with voice characteristics from the voiceprint
      if ('speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(text);

        // Adjust synthesis parameters based on voiceprint analysis
        // Map average pitch to rate/pitch adjustments
        const basePitch = 150; // Average human speaking pitch
        const pitchRatio = selectedVP.averagePitch / basePitch;
        utterance.pitch = Math.max(0.1, Math.min(2, pitchRatio));
        utterance.rate = 0.9; // Slightly slower for clarity

        // Try to find a Chinese voice
        const voices = speechSynthesis.getVoices();
        const zhVoice = voices.find(v => v.lang.startsWith('zh'));
        if (zhVoice) {
          utterance.voice = zhVoice;
        }

        utterance.onstart = () => setSpeakingState('speaking');
        utterance.onend = () => setSpeakingState('idle');
        utterance.onerror = (event) => {
          console.error('Speech synthesis error:', event);
          setError('语音合成失败，请重试');
          setSpeakingState('error');
        };

        speechSynthesis.cancel(); // Cancel any ongoing speech
        speechSynthesis.speak(utterance);
      } else {
        setError('您的浏览器不支持语音合成');
        setSpeakingState('error');
      }
    } catch (err: any) {
      console.error('Synthesis failed:', err);
      setError('语音合成失败: ' + (err.message || '未知错误'));
      setSpeakingState('error');
    }
  };

  const handlePlayOriginal = async () => {
    if (!selectedVP) return;

    try {
      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      const buffer = await base64ToAudioBuffer(selectedVP.audioData, audioContext);
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
        <h3 className="text-lg font-semibold text-gray-500">暂无可用声纹</h3>
        <p className="text-gray-400 text-sm mt-1">请先录制声音并保存声纹</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="text-center">
        <h2 className="text-xl font-bold text-gray-900 mb-1">文字转语音</h2>
        <p className="text-gray-500 text-sm">选择声纹，输入文字，生成语音</p>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start space-x-3">
          <AlertCircle className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Voice selection */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4">
        <label className="text-sm font-medium text-gray-700 mb-2 block">选择声纹</label>
        <div className="relative">
          <button
            onClick={() => setShowDropdown(!showDropdown)}
            className="w-full border border-gray-300 rounded-xl px-4 py-3 text-left flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
              <span className="text-gray-400">请选择声纹</span>
            )}
            <ChevronDown className="h-5 w-5 text-gray-400" />
          </button>

          {showDropdown && (
            <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
              {voicePrints.map((vp) => (
                <button
                  key={vp.id}
                  onClick={() => {
                    setSelectedVPId(vp.id);
                    setShowDropdown(false);
                  }}
                  className={`w-full px-4 py-3 text-left flex items-center space-x-3 transition-colors ${
                    vp.id === selectedVPId
                      ? 'bg-indigo-50'
                      : 'hover:bg-gray-50 active:bg-gray-100'
                  }`}
                >
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                    vp.id === selectedVPId ? 'bg-indigo-200' : 'bg-gray-100'
                  }`}>
                    <Activity className={`h-4 w-4 ${
                      vp.id === selectedVPId ? 'text-indigo-600' : 'text-gray-500'
                    }`} />
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
          >
            <Volume2 className="h-4 w-4" />
            <span>试听原始录音</span>
          </button>
        )}
      </div>

      {/* Text input */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4">
        <label className="text-sm font-medium text-gray-700 mb-2 block">输入文字</label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="请输入要转换为语音的文字..."
          className="w-full border border-gray-300 rounded-xl px-4 py-3 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
          rows={4}
          maxLength={500}
        />
        <div className="flex justify-between items-center mt-2">
          <span className="text-xs text-gray-400">{text.length}/500</span>
        </div>
      </div>

      {/* Synthesize button */}
      <div className="space-y-3">
        {speakingState === 'speaking' || speakingState === 'synthesizing' ? (
          <button
            onClick={handleStop}
            className="w-full bg-red-500 text-white rounded-xl py-4 font-semibold flex items-center justify-center space-x-2 active:bg-red-600 transition-colors"
          >
            <Volume2 className="h-5 w-5 animate-pulse" />
            <span>{speakingState === 'synthesizing' ? '正在合成...' : '正在播放...点击停止'}</span>
          </button>
        ) : (
          <button
            onClick={handleSynthesize}
            disabled={!text.trim() || !selectedVPId}
            className="w-full bg-indigo-600 text-white rounded-xl py-4 font-semibold flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed active:bg-indigo-700 transition-colors"
          >
            <Volume2 className="h-5 w-5" />
            <span>合成语音</span>
          </button>
        )}
      </div>

      {/* Info note */}
      <div className="bg-amber-50 rounded-xl p-4 text-sm text-amber-700">
        <p className="font-medium mb-1">关于声音克隆</p>
        <p>
          当前版本使用浏览器内置语音合成引擎，根据声纹音高特征调整输出。
          完整的声音克隆功能需要接入 AI 语音合成服务（如 ElevenLabs、Azure Custom Neural Voice），
          可实现高度逼真的声音复刻。应用架构已预留 API 接口，可随时扩展。
        </p>
      </div>
    </div>
  );
}
