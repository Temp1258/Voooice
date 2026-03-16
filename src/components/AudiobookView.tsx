import React, { useState, useRef } from 'react';
import { BookOpen, Play, Pause, SkipForward, SkipBack, Volume2, Download, Share2, AlertCircle } from 'lucide-react';
import { voiceCloneService } from '../services/voiceCloneService';
import { downloadBlob, shareAudio } from '../utils/audioExport';
import type { VoicePrint, EmotionType } from '../types';

interface AudiobookViewProps {
  voicePrints: VoicePrint[];
}

interface TextChunk {
  id: number;
  text: string;
  audioBlob: Blob | null;
  status: 'pending' | 'synthesizing' | 'done' | 'error';
}

const MAX_CHUNK_LENGTH = 500;

function splitTextIntoChunks(text: string): string[] {
  const chunks: string[] = [];
  // Split on sentence boundaries (Chinese and English punctuation)
  const sentences = text.split(/(?<=[。！？.!?\n])/);

  let current = '';
  for (const sentence of sentences) {
    if ((current + sentence).length > MAX_CHUNK_LENGTH && current.length > 0) {
      chunks.push(current.trim());
      current = sentence;
    } else {
      current += sentence;
    }
  }
  if (current.trim()) {
    chunks.push(current.trim());
  }
  return chunks;
}

export function AudiobookView({ voicePrints }: AudiobookViewProps) {
  const [text, setText] = useState('');
  const [selectedVPId, setSelectedVPId] = useState(voicePrints[0]?.id || '');
  const [chunks, setChunks] = useState<TextChunk[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentChunkIndex, setCurrentChunkIndex] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const allAudioRef = useRef<Blob[]>([]);

  const selectedVP = voicePrints.find(vp => vp.id === selectedVPId);

  const handleStartSynthesis = async () => {
    if (!text.trim() || !selectedVP) return;

    setError(null);
    const textChunks = splitTextIntoChunks(text);
    const newChunks: TextChunk[] = textChunks.map((t, i) => ({
      id: i,
      text: t,
      audioBlob: null,
      status: 'pending' as const,
    }));
    setChunks(newChunks);
    setIsProcessing(true);
    setProgress(0);
    allAudioRef.current = [];

    const voiceId = selectedVP.cloudVoiceId || selectedVP.id;

    for (let i = 0; i < newChunks.length; i++) {
      setChunks(prev => prev.map((c, idx) =>
        idx === i ? { ...c, status: 'synthesizing' } : c
      ));

      try {
        const audioBlob = await voiceCloneService.synthesize(newChunks[i].text, voiceId, {
          language: 'zh-CN',
          emotion: 'neutral' as EmotionType,
          speed: 1.0,
          stability: 0.5,
          similarity: 0.75,
        });

        allAudioRef.current.push(audioBlob);
        setChunks(prev => prev.map((c, idx) =>
          idx === i ? { ...c, audioBlob, status: 'done' } : c
        ));
        setProgress(((i + 1) / newChunks.length) * 100);
      } catch (err) {
        console.error(`Chunk ${i} synthesis failed:`, err);
        setChunks(prev => prev.map((c, idx) =>
          idx === i ? { ...c, status: 'error' } : c
        ));
      }
    }

    setIsProcessing(false);
  };

  const playChunk = async (index: number) => {
    const chunk = chunks[index];
    if (!chunk?.audioBlob || chunk.audioBlob.size === 0) {
      // For Web Speech fallback (empty blob), use speechSynthesis
      const utterance = new SpeechSynthesisUtterance(chunk.text);
      utterance.lang = 'zh-CN';
      utterance.onend = () => {
        if (index < chunks.length - 1) {
          playChunk(index + 1);
        } else {
          setIsPlaying(false);
          setCurrentChunkIndex(-1);
        }
      };
      speechSynthesis.speak(utterance);
      setCurrentChunkIndex(index);
      return;
    }

    try {
      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      const buffer = await audioContext.decodeAudioData(await chunk.audioBlob.arrayBuffer());
      const source = audioContext.createBufferSource();
      source.buffer = buffer;
      source.connect(audioContext.destination);
      sourceRef.current = source;

      source.onended = () => {
        audioContext.close();
        if (index < chunks.length - 1 && isPlaying) {
          playChunk(index + 1);
        } else {
          setIsPlaying(false);
          setCurrentChunkIndex(-1);
        }
      };

      setCurrentChunkIndex(index);
      source.start();
    } catch (err) {
      console.error('Playback failed:', err);
    }
  };

  const handlePlayAll = () => {
    const firstDone = chunks.findIndex(c => c.status === 'done');
    if (firstDone === -1) return;
    setIsPlaying(true);
    playChunk(firstDone);
  };

  const handlePause = () => {
    setIsPlaying(false);
    speechSynthesis.cancel();
    if (sourceRef.current) {
      try { sourceRef.current.stop(); } catch {}
    }
    setCurrentChunkIndex(-1);
  };

  const handleSkipForward = () => {
    if (currentChunkIndex < chunks.length - 1) {
      handlePause();
      setIsPlaying(true);
      playChunk(currentChunkIndex + 1);
    }
  };

  const handleSkipBack = () => {
    if (currentChunkIndex > 0) {
      handlePause();
      setIsPlaying(true);
      playChunk(currentChunkIndex - 1);
    }
  };

  const handleExport = () => {
    const completedBlobs = allAudioRef.current.filter(b => b.size > 0);
    if (completedBlobs.length === 0) return;
    const combined = new Blob(completedBlobs, { type: 'audio/wav' });
    const timestamp = new Date().toISOString().slice(0, 10);
    downloadBlob(combined, `VocalText_Audiobook_${timestamp}.wav`);
  };

  const handleShare = async () => {
    const completedBlobs = allAudioRef.current.filter(b => b.size > 0);
    if (completedBlobs.length === 0) return;
    const combined = new Blob(completedBlobs, { type: 'audio/wav' });
    const timestamp = new Date().toISOString().slice(0, 10);
    await shareAudio(combined, `VocalText_Audiobook_${timestamp}.wav`, '有声读物');
  };

  const doneCount = chunks.filter(c => c.status === 'done').length;

  if (voicePrints.length === 0) {
    return (
      <div className="text-center py-16">
        <BookOpen className="h-16 w-16 text-gray-300 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-gray-500">暂无可用声纹</h3>
        <p className="text-gray-400 text-sm mt-1">请先录制声音并保存声纹</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="text-center">
        <h2 className="text-xl font-bold text-gray-900 mb-1">有声读物模式</h2>
        <p className="text-gray-500 text-sm">输入长文本，自动分段合成语音</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-start space-x-2">
          <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Voice selection */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4">
        <label className="text-sm font-medium text-gray-700 mb-2 block">选择声纹</label>
        <select
          value={selectedVPId}
          onChange={(e) => setSelectedVPId(e.target.value)}
          className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          {voicePrints.map(vp => (
            <option key={vp.id} value={vp.id}>{vp.name} ({vp.averagePitch} Hz)</option>
          ))}
        </select>
      </div>

      {/* Text input */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4">
        <div className="flex justify-between items-center mb-2">
          <label className="text-sm font-medium text-gray-700">输入文本</label>
          <span className="text-xs text-gray-400">{text.length} 字</span>
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="粘贴文章、故事或任何长文本...&#10;系统将自动按句子分段合成语音。"
          className="w-full border border-gray-300 rounded-xl px-4 py-3 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
          rows={8}
          maxLength={10000}
        />

        {chunks.length === 0 && (
          <button
            onClick={handleStartSynthesis}
            disabled={!text.trim() || !selectedVPId || isProcessing}
            className="w-full mt-3 bg-indigo-600 text-white rounded-xl py-3 font-semibold flex items-center justify-center space-x-2 disabled:opacity-50"
          >
            <BookOpen className="h-5 w-5" />
            <span>开始合成</span>
          </button>
        )}
      </div>

      {/* Synthesis progress */}
      {chunks.length > 0 && (
        <>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4">
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-sm font-medium text-gray-700">合成进度</h3>
              <span className="text-xs text-gray-400">
                {doneCount} / {chunks.length} 段
              </span>
            </div>

            {/* Progress bar */}
            <div className="w-full bg-gray-200 rounded-full h-2 mb-4">
              <div
                className="bg-indigo-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>

            {/* Chunk list */}
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {chunks.map((chunk, i) => (
                <div
                  key={chunk.id}
                  className={`flex items-center space-x-3 p-2 rounded-lg text-sm ${
                    i === currentChunkIndex
                      ? 'bg-indigo-50 border border-indigo-200'
                      : 'bg-gray-50'
                  }`}
                >
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs flex-shrink-0 ${
                    chunk.status === 'done'
                      ? 'bg-green-500 text-white'
                      : chunk.status === 'synthesizing'
                      ? 'bg-indigo-500 text-white animate-pulse'
                      : chunk.status === 'error'
                      ? 'bg-red-500 text-white'
                      : 'bg-gray-200 text-gray-500'
                  }`}>
                    {i + 1}
                  </div>
                  <p className="text-gray-600 truncate flex-1">
                    {chunk.text.slice(0, 40)}...
                  </p>
                  {chunk.status === 'done' && (
                    <button
                      onClick={() => { setIsPlaying(true); playChunk(i); }}
                      className="text-indigo-600"
                    >
                      <Play className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Playback controls */}
          {doneCount > 0 && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4">
              <div className="flex items-center justify-center space-x-6">
                <button
                  onClick={handleSkipBack}
                  disabled={currentChunkIndex <= 0}
                  className="p-2 text-gray-400 disabled:opacity-30"
                >
                  <SkipBack className="h-5 w-5" />
                </button>

                {isPlaying ? (
                  <button
                    onClick={handlePause}
                    className="w-14 h-14 bg-indigo-600 rounded-full flex items-center justify-center text-white"
                  >
                    <Pause className="h-6 w-6" />
                  </button>
                ) : (
                  <button
                    onClick={handlePlayAll}
                    className="w-14 h-14 bg-indigo-600 rounded-full flex items-center justify-center text-white"
                  >
                    <Play className="h-6 w-6 ml-0.5" />
                  </button>
                )}

                <button
                  onClick={handleSkipForward}
                  disabled={currentChunkIndex >= chunks.length - 1}
                  className="p-2 text-gray-400 disabled:opacity-30"
                >
                  <SkipForward className="h-5 w-5" />
                </button>
              </div>

              {currentChunkIndex >= 0 && (
                <p className="text-center text-xs text-gray-400 mt-2">
                  正在播放第 {currentChunkIndex + 1} / {chunks.length} 段
                </p>
              )}

              {/* Export / Share */}
              <div className="flex space-x-3 mt-4">
                <button
                  onClick={handleExport}
                  className="flex-1 py-2.5 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium flex items-center justify-center space-x-1.5"
                >
                  <Download className="h-4 w-4" />
                  <span>导出音频</span>
                </button>
                <button
                  onClick={handleShare}
                  className="flex-1 py-2.5 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium flex items-center justify-center space-x-1.5"
                >
                  <Share2 className="h-4 w-4" />
                  <span>分享</span>
                </button>
              </div>
            </div>
          )}
        </>
      )}

      <div className="bg-amber-50 rounded-xl p-4 text-sm text-amber-700">
        <p className="font-medium mb-1">有声读物模式说明</p>
        <p>
          系统会自动将长文本按句子分段，逐段合成语音。合成完成后可连续播放，
          也可导出为音频文件。支持最多 10,000 字的文本。
        </p>
      </div>
    </div>
  );
}
