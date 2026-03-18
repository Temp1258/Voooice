import React, { useState, useRef } from 'react';
import { Users, Plus, Trash2, Play, Pause, Download, AlertCircle, MessageCircle } from 'lucide-react';
import { voiceCloneService } from '../services/voiceCloneService';
import { downloadBlob } from '../utils/audioExport';
import type { VoicePrint, EmotionType } from '../types';

interface MultiRoleDialogueViewProps {
  voicePrints: VoicePrint[];
}

interface DialogueLine {
  id: string;
  voicePrintId: string;
  text: string;
  emotion: EmotionType;
  audioBlob: Blob | null;
  status: 'pending' | 'synthesizing' | 'done' | 'error';
}

export function MultiRoleDialogueView({ voicePrints }: MultiRoleDialogueViewProps) {
  const [lines, setLines] = useState<DialogueLine[]>([
    createEmptyLine(voicePrints[0]?.id || ''),
    createEmptyLine(voicePrints[1]?.id || voicePrints[0]?.id || ''),
  ]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentLineIndex, setCurrentLineIndex] = useState(-1);
  const [error, setError] = useState<string | null>(null);

  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  function createEmptyLine(vpId: string): DialogueLine {
    return {
      id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
      voicePrintId: vpId,
      text: '',
      emotion: 'neutral',
      audioBlob: null,
      status: 'pending',
    };
  }

  const addLine = () => {
    // Alternate between first two voice prints for convenience
    const lastVpId = lines[lines.length - 1]?.voicePrintId;
    const otherVp = voicePrints.find(vp => vp.id !== lastVpId);
    setLines(prev => [...prev, createEmptyLine(otherVp?.id || lastVpId || '')]);
  };

  const removeLine = (id: string) => {
    if (lines.length <= 1) return;
    setLines(prev => prev.filter(l => l.id !== id));
  };

  const updateLine = (id: string, updates: Partial<DialogueLine>) => {
    setLines(prev => prev.map(l => l.id === id ? { ...l, ...updates } : l));
  };

  const handleSynthesizeAll = async () => {
    setError(null);
    setIsProcessing(true);

    const updatedLines = [...lines];
    for (let i = 0; i < updatedLines.length; i++) {
      const line = updatedLines[i];
      if (!line.text.trim()) continue;

      setLines(prev => prev.map((l, idx) =>
        idx === i ? { ...l, status: 'synthesizing' } : l
      ));

      try {
        const vp = voicePrints.find(v => v.id === line.voicePrintId);
        const voiceId = vp?.cloudVoiceId || line.voicePrintId;

        const audioBlob = await voiceCloneService.synthesize(line.text, voiceId, {
          language: 'zh-CN',
          emotion: line.emotion,
          speed: 1.0,
          stability: 0.5,
          similarity: 0.75,
        });

        updatedLines[i] = { ...updatedLines[i], audioBlob, status: 'done' };
        setLines(prev => prev.map((l, idx) =>
          idx === i ? { ...l, audioBlob, status: 'done' } : l
        ));
      } catch (err) {
        console.error(`Line ${i} synthesis failed:`, err);
        setLines(prev => prev.map((l, idx) =>
          idx === i ? { ...l, status: 'error' } : l
        ));
      }
    }

    setIsProcessing(false);
  };

  const playLine = async (index: number) => {
    const line = lines[index];
    if (!line?.audioBlob) return;

    if (line.audioBlob.size === 0) {
      // Web Speech fallback
      const utterance = new SpeechSynthesisUtterance(line.text);
      utterance.lang = 'zh-CN';
      utterance.onend = () => {
        if (isPlaying && index < lines.length - 1) {
          playLine(index + 1);
        } else {
          setIsPlaying(false);
          setCurrentLineIndex(-1);
        }
      };
      speechSynthesis.speak(utterance);
      setCurrentLineIndex(index);
      return;
    }

    try {
      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      const buffer = await audioContext.decodeAudioData(await line.audioBlob.arrayBuffer());
      const source = audioContext.createBufferSource();
      source.buffer = buffer;
      source.connect(audioContext.destination);
      sourceRef.current = source;

      source.onended = () => {
        audioContext.close();
        if (isPlaying && index < lines.length - 1) {
          const nextDone = lines.findIndex((l, i) => i > index && l.status === 'done');
          if (nextDone >= 0) {
            playLine(nextDone);
          } else {
            setIsPlaying(false);
            setCurrentLineIndex(-1);
          }
        } else {
          setIsPlaying(false);
          setCurrentLineIndex(-1);
        }
      };

      setCurrentLineIndex(index);
      source.start();
    } catch (err) {
      console.error('Playback failed:', err);
    }
  };

  const handlePlayAll = () => {
    const firstDone = lines.findIndex(l => l.status === 'done');
    if (firstDone === -1) return;
    setIsPlaying(true);
    playLine(firstDone);
  };

  const handleStop = () => {
    setIsPlaying(false);
    speechSynthesis.cancel();
    if (sourceRef.current) {
      try { sourceRef.current.stop(); } catch {}
    }
    setCurrentLineIndex(-1);
  };

  const handleExportAll = () => {
    const blobs = lines.filter(l => l.audioBlob && l.audioBlob.size > 0).map(l => l.audioBlob!);
    if (blobs.length === 0) return;
    const combined = new Blob(blobs, { type: 'audio/wav' });
    const timestamp = new Date().toISOString().slice(0, 10);
    downloadBlob(combined, `Voooice_Dialogue_${timestamp}.wav`);
  };

  const getVoiceColor = (vpId: string): string => {
    const idx = voicePrints.findIndex(vp => vp.id === vpId);
    const colors = ['bg-indigo-100 text-indigo-700', 'bg-green-100 text-green-700', 'bg-purple-100 text-purple-700', 'bg-amber-100 text-amber-700', 'bg-pink-100 text-pink-700'];
    return colors[idx % colors.length];
  };

  if (voicePrints.length === 0) {
    return (
      <div className="text-center py-16">
        <Users className="h-16 w-16 text-gray-300 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-gray-500">暂无可用声纹</h3>
        <p className="text-gray-400 text-sm mt-1">请先录制至少两个声纹</p>
      </div>
    );
  }

  const doneCount = lines.filter(l => l.status === 'done').length;

  return (
    <div className="space-y-5">
      <div className="text-center">
        <h2 className="text-xl font-bold text-gray-900 mb-1">多角色对话</h2>
        <p className="text-gray-500 text-sm">为每行台词分配不同声纹，创建对话场景</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-start space-x-2">
          <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Dialogue lines */}
      <div className="space-y-3">
        {lines.map((line, index) => {
          const vp = voicePrints.find(v => v.id === line.voicePrintId);
          return (
            <div
              key={line.id}
              className={`bg-white rounded-2xl shadow-sm border p-4 ${
                index === currentLineIndex ? 'border-indigo-300 bg-indigo-50/30' : 'border-gray-200'
              }`}
            >
              {/* Voice selector + emotion */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center space-x-2">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getVoiceColor(line.voicePrintId)}`}>
                    {vp?.name || '未知'}
                  </span>
                  <select
                    value={line.voicePrintId}
                    onChange={(e) => updateLine(line.id, { voicePrintId: e.target.value })}
                    className="text-xs border border-gray-200 rounded-lg px-2 py-1"
                    disabled={isProcessing}
                  >
                    {voicePrints.map(vp => (
                      <option key={vp.id} value={vp.id}>{vp.name}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center space-x-1">
                  <select
                    value={line.emotion}
                    onChange={(e) => updateLine(line.id, { emotion: e.target.value as EmotionType })}
                    className="text-xs border border-gray-200 rounded-lg px-2 py-1"
                    disabled={isProcessing}
                  >
                    <option value="neutral">中性</option>
                    <option value="happy">开心</option>
                    <option value="sad">悲伤</option>
                    <option value="angry">愤怒</option>
                    <option value="excited">激动</option>
                    <option value="calm">温柔</option>
                  </select>
                  {lines.length > 1 && (
                    <button
                      onClick={() => removeLine(line.id)}
                      className="p-1 text-gray-300 hover:text-red-500"
                      disabled={isProcessing}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Text input */}
              <textarea
                value={line.text}
                onChange={(e) => updateLine(line.id, { text: e.target.value })}
                placeholder={`第 ${index + 1} 句台词...`}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                rows={2}
                maxLength={500}
                disabled={isProcessing}
              />

              {/* Status indicator */}
              {line.status === 'synthesizing' && (
                <p className="text-xs text-indigo-500 mt-1 animate-pulse">合成中...</p>
              )}
              {line.status === 'done' && (
                <div className="flex items-center justify-between mt-1">
                  <p className="text-xs text-green-600">已完成</p>
                  <button
                    onClick={() => playLine(index)}
                    className="text-indigo-600"
                  >
                    <Play className="h-4 w-4" />
                  </button>
                </div>
              )}
              {line.status === 'error' && (
                <p className="text-xs text-red-500 mt-1">合成失败</p>
              )}
            </div>
          );
        })}
      </div>

      {/* Add line button */}
      <button
        onClick={addLine}
        disabled={isProcessing}
        className="w-full py-3 border-2 border-dashed border-gray-200 rounded-2xl text-gray-400 text-sm font-medium flex items-center justify-center space-x-1 disabled:opacity-50"
      >
        <Plus className="h-4 w-4" />
        <span>添加台词</span>
      </button>

      {/* Action buttons */}
      <div className="space-y-3">
        {doneCount > 0 ? (
          <div className="flex space-x-3">
            {isPlaying ? (
              <button
                onClick={handleStop}
                className="flex-1 py-3 bg-red-500 text-white rounded-xl font-semibold flex items-center justify-center space-x-2"
              >
                <Pause className="h-5 w-5" />
                <span>停止</span>
              </button>
            ) : (
              <button
                onClick={handlePlayAll}
                className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-semibold flex items-center justify-center space-x-2"
              >
                <Play className="h-5 w-5" />
                <span>连续播放</span>
              </button>
            )}
            <button
              onClick={handleExportAll}
              className="py-3 px-4 bg-gray-100 text-gray-700 rounded-xl font-medium"
            >
              <Download className="h-5 w-5" />
            </button>
          </div>
        ) : (
          <button
            onClick={handleSynthesizeAll}
            disabled={isProcessing || lines.every(l => !l.text.trim())}
            className="w-full py-3 bg-indigo-600 text-white rounded-xl font-semibold flex items-center justify-center space-x-2 disabled:opacity-50"
          >
            <MessageCircle className="h-5 w-5" />
            <span>{isProcessing ? '合成中...' : '合成对话'}</span>
          </button>
        )}
      </div>

      <div className="bg-blue-50 rounded-xl p-4 text-sm text-blue-700">
        <p className="font-medium mb-1">多角色对话说明</p>
        <p>为每行台词选择不同的声纹和情感，创建逼真的对话场景。完成后可连续播放或导出音频文件。</p>
      </div>
    </div>
  );
}
