import React, { useState, useEffect } from 'react';
import { Mic, Square, Check, ChevronRight, AlertCircle, RotateCcw } from 'lucide-react';
import { useAudioRecorder } from '../hooks/useAudioRecorder';
import { WaveformVisualizer } from './WaveformVisualizer';
import { extractFrequencyProfile, estimateAveragePitch, audioBufferToBlob } from '../utils/audioAnalyzer';
import { saveVoicePrint, updateVoicePrint } from '../utils/storage';
import { voiceCloneService } from '../services/voiceCloneService';
import type { VoicePrint } from '../types';

interface VoiceTrainingViewProps {
  onComplete: (vp: VoicePrint) => void;
  onCancel: () => void;
}

interface TrainingSegment {
  id: number;
  prompt: string;
  promptEn: string;
  minDuration: number;
  recorded: boolean;
  audioBuffer: AudioBuffer | null;
  audioBlob: Blob | null;
}

const TRAINING_SEGMENTS: Omit<TrainingSegment, 'recorded' | 'audioBuffer' | 'audioBlob'>[] = [
  {
    id: 1,
    prompt: '今天天气真好，阳光明媚，微风轻拂，是个出门散步的好日子。',
    promptEn: 'What a beautiful day today, with bright sunshine and gentle breeze, perfect for a walk.',
    minDuration: 5,
  },
  {
    id: 2,
    prompt: '科技改变生活，人工智能正在以前所未有的速度发展，为各行各业带来巨大的变革。',
    promptEn: 'Technology changes lives. AI is developing at an unprecedented pace, bringing transformation to every industry.',
    minDuration: 8,
  },
  {
    id: 3,
    prompt: '亲爱的朋友，很高兴收到你的来信。最近一切都好，工作顺利，生活充实。',
    promptEn: 'Dear friend, I am glad to receive your letter. Everything has been well lately—work is smooth and life is fulfilling.',
    minDuration: 6,
  },
  {
    id: 4,
    prompt: '一二三四五六七八九十，春夏秋冬，东南西北，上下左右。',
    promptEn: 'One two three four five six seven eight nine ten, spring summer fall winter, east south west north.',
    minDuration: 5,
  },
  {
    id: 5,
    prompt: '请问您好！谢谢，不客气。对不起，没关系。再见，祝您一切顺利！',
    promptEn: 'Hello! Thank you, you are welcome. Sorry, no problem. Goodbye, I wish you all the best!',
    minDuration: 5,
  },
];

export function VoiceTrainingView({ onComplete, onCancel }: VoiceTrainingViewProps) {
  const [segments, setSegments] = useState<TrainingSegment[]>(
    TRAINING_SEGMENTS.map(s => ({ ...s, recorded: false, audioBuffer: null, audioBlob: null }))
  );
  const [currentStep, setCurrentStep] = useState(0);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recorder = useAudioRecorder();
  const allRecorded = segments.every(s => s.recorded);
  const currentSegment = segments[currentStep];

  useEffect(() => {
    if (recorder.state === 'done' && recorder.audioBuffer) {
      const audioBlob = audioBufferToBlob(recorder.audioBuffer);
      setSegments(prev => prev.map((s, i) =>
        i === currentStep
          ? { ...s, recorded: true, audioBuffer: recorder.audioBuffer, audioBlob }
          : s
      ));
    }
  }, [recorder.state, recorder.audioBuffer, currentStep]);

  const handleRecord = async () => {
    setError(null);
    await recorder.startRecording();
  };

  const handleStop = () => {
    if (recorder.duration < currentSegment.minDuration) {
      setError(`请至少录制 ${currentSegment.minDuration} 秒`);
      return;
    }
    recorder.stopRecording();
  };

  const handleRetry = () => {
    setSegments(prev => prev.map((s, i) =>
      i === currentStep
        ? { ...s, recorded: false, audioBuffer: null, audioBlob: null }
        : s
    ));
    recorder.reset();
  };

  const handleNext = () => {
    recorder.reset();
    if (currentStep < segments.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleSave = async () => {
    if (!name.trim()) return;

    setSaving(true);
    setError(null);

    try {
      // Merge all audio buffers into one combined blob
      const allBlobs = segments
        .filter(s => s.audioBlob)
        .map(s => s.audioBlob!);
      const combinedBlob = new Blob(allBlobs, { type: 'audio/wav' });

      // Calculate combined analysis from all segments
      const allProfiles: number[][] = [];
      const allPitches: number[] = [];
      let totalDuration = 0;

      for (const seg of segments) {
        if (seg.audioBuffer) {
          allProfiles.push(extractFrequencyProfile(seg.audioBuffer));
          allPitches.push(estimateAveragePitch(seg.audioBuffer));
          totalDuration += seg.audioBuffer.duration;
        }
      }

      // Average the frequency profiles
      const profileLength = allProfiles[0]?.length || 0;
      const avgProfile = new Array(profileLength).fill(0);
      for (const profile of allProfiles) {
        for (let i = 0; i < profileLength; i++) {
          avgProfile[i] += (profile[i] || 0) / allProfiles.length;
        }
      }

      const avgPitch = Math.round(
        allPitches.reduce((a, b) => a + b, 0) / allPitches.length
      );

      const voiceprint: VoicePrint = {
        id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
        name: name.trim(),
        createdAt: Date.now(),
        hasAudioBlob: true,
        duration: Math.round(totalDuration),
        frequencyProfile: avgProfile,
        averagePitch: avgPitch,
        language: 'zh-CN',
      };

      await saveVoicePrint(voiceprint, combinedBlob);

      // Upload to cloud if API key configured
      const apiKey = voiceCloneService.getApiKey();
      if (apiKey) {
        try {
          const cloudVoiceId = await voiceCloneService.cloneVoice(combinedBlob, voiceprint.name);
          await updateVoicePrint(voiceprint.id, { cloudVoiceId });
          voiceprint.cloudVoiceId = cloudVoiceId;
        } catch (err) {
          console.error('Cloud upload failed:', err);
          // Continue - local save succeeded
        }
      }

      onComplete(voiceprint);
    } catch (err) {
      console.error('Failed to save training data:', err);
      setError('保存失败，请重试');
    } finally {
      setSaving(false);
    }
  };

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="space-y-5">
      <div className="text-center">
        <h2 className="text-xl font-bold text-gray-900 mb-1">声纹训练</h2>
        <p className="text-gray-500 text-sm">
          录制多段语音样本以创建更准确的声纹档案
        </p>
      </div>

      {/* Progress bar */}
      <div className="flex items-center space-x-1.5">
        {segments.map((seg, i) => (
          <div
            key={seg.id}
            className={`flex-1 h-2 rounded-full transition-colors ${
              seg.recorded
                ? 'bg-green-500'
                : i === currentStep
                ? 'bg-indigo-400'
                : 'bg-gray-200'
            }`}
          />
        ))}
      </div>
      <p className="text-center text-sm text-gray-400">
        第 {currentStep + 1} / {segments.length} 段
      </p>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-start space-x-2">
          <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Current prompt */}
      {!allRecorded && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5">
          <p className="text-xs text-gray-400 mb-2">请朗读以下文字：</p>
          <p className="text-gray-900 font-medium leading-relaxed text-lg">
            {currentSegment.prompt}
          </p>
          <p className="text-gray-400 text-xs mt-2 italic">
            {currentSegment.promptEn}
          </p>

          {/* Waveform */}
          <div className="bg-gray-50 rounded-xl p-3 mt-4">
            {recorder.state === 'recording' ? (
              <WaveformVisualizer
                analyserNode={recorder.analyserNode}
                isActive={true}
                color="#ef4444"
                height={60}
              />
            ) : (
              <div className="h-[60px] flex items-center justify-center">
                <div className="flex items-center space-x-1">
                  {Array.from({ length: 30 }).map((_, i) => (
                    <div
                      key={i}
                      className={`w-1 rounded-full ${
                        currentSegment.recorded ? 'bg-green-400' : 'bg-gray-300'
                      }`}
                      style={{ height: `${4 + Math.random() * 8}px` }}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Timer */}
          <div className="text-center mt-3">
            <span className="text-2xl font-mono font-bold text-gray-900">
              {formatDuration(recorder.duration)}
            </span>
            <span className="text-xs text-gray-400 ml-2">
              (最少 {currentSegment.minDuration}s)
            </span>
          </div>

          {/* Controls */}
          <div className="flex items-center justify-center space-x-4 mt-4">
            {recorder.state === 'idle' || recorder.state === 'error' ? (
              currentSegment.recorded ? (
                <div className="flex items-center space-x-3">
                  <button
                    onClick={handleRetry}
                    className="px-4 py-2 bg-gray-100 rounded-xl text-sm font-medium text-gray-600 flex items-center space-x-1"
                  >
                    <RotateCcw className="h-4 w-4" />
                    <span>重录</span>
                  </button>
                  <button
                    onClick={handleNext}
                    className="px-6 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium flex items-center space-x-1"
                  >
                    <span>下一段</span>
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleRecord}
                  className="w-16 h-16 bg-red-500 rounded-full flex items-center justify-center active:bg-red-600 transition-colors shadow-lg shadow-red-500/30"
                >
                  <Mic className="h-7 w-7 text-white" />
                </button>
              )
            ) : recorder.state === 'recording' ? (
              <button
                onClick={handleStop}
                className="w-16 h-16 bg-red-500 rounded-full flex items-center justify-center active:bg-red-600 transition-colors shadow-lg shadow-red-500/30 animate-pulse"
              >
                <Square className="h-7 w-7 text-white" />
              </button>
            ) : recorder.state === 'processing' ? (
              <div className="text-gray-400 text-sm">分析中...</div>
            ) : null}
          </div>
        </div>
      )}

      {/* Segment overview */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4">
        <h3 className="font-semibold text-gray-900 mb-3 text-sm">录制进度</h3>
        <div className="space-y-2">
          {segments.map((seg, i) => (
            <button
              key={seg.id}
              onClick={() => { if (!allRecorded) { recorder.reset(); setCurrentStep(i); } }}
              className={`w-full flex items-center justify-between p-3 rounded-xl text-left transition-colors ${
                i === currentStep && !allRecorded
                  ? 'bg-indigo-50 border border-indigo-200'
                  : 'bg-gray-50'
              }`}
            >
              <div className="flex items-center space-x-3">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                  seg.recorded
                    ? 'bg-green-500 text-white'
                    : i === currentStep
                    ? 'bg-indigo-500 text-white'
                    : 'bg-gray-200 text-gray-500'
                }`}>
                  {seg.recorded ? <Check className="h-4 w-4" /> : i + 1}
                </div>
                <p className="text-sm text-gray-700 truncate max-w-[200px]">
                  {seg.prompt.slice(0, 20)}...
                </p>
              </div>
              {seg.recorded && (
                <span className="text-xs text-green-600 font-medium">已录制</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Save section (when all recorded) */}
      {allRecorded && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5 space-y-4">
          <div className="text-center">
            <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <Check className="h-7 w-7 text-green-600" />
            </div>
            <h3 className="font-bold text-gray-900 text-lg">录制完成！</h3>
            <p className="text-gray-500 text-sm mt-1">
              已录制 {segments.length} 段语音，声纹质量将显著提升
            </p>
          </div>

          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="为这个声纹命名..."
            className="w-full border border-gray-300 rounded-xl px-4 py-3 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            maxLength={30}
          />

          <div className="flex space-x-3">
            <button
              onClick={onCancel}
              className="flex-1 py-3 bg-gray-100 text-gray-600 rounded-xl font-medium"
            >
              取消
            </button>
            <button
              onClick={handleSave}
              disabled={!name.trim() || saving}
              className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-semibold disabled:opacity-50"
            >
              {saving ? '保存中...' : '保存声纹'}
            </button>
          </div>
        </div>
      )}

      {/* Cancel button */}
      {!allRecorded && (
        <button
          onClick={onCancel}
          className="w-full py-3 text-gray-400 text-sm"
        >
          取消训练
        </button>
      )}
    </div>
  );
}
