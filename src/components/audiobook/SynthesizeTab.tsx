import React, { useState, useRef, useCallback } from 'react';
import { Play, Pause, Zap, Check, AlertCircle } from 'lucide-react';
import { voiceCloneService } from '../../services/voiceCloneService';
import { useAudiobook } from './AudiobookContext';

function StatusBadge({ status, t }: { status: string; t: (k: string) => string }) {
  const colors: Record<string, string> = {
    pending: 'bg-gray-100 text-gray-600',
    synthesizing: 'bg-blue-100 text-blue-700 animate-pulse',
    done: 'bg-green-100 text-green-700',
    error: 'bg-red-100 text-red-700',
    draft: 'bg-gray-100 text-gray-600',
    completed: 'bg-green-100 text-green-700',
    published: 'bg-purple-100 text-purple-700',
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors[status] || 'bg-gray-100 text-gray-600'}`}>
      {t(`audiobook.status.${status}`)}
    </span>
  );
}

export function SynthesizeTab() {
  const { book, setBook, voicePrints, t } = useAudiobook();
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const pauseRef = useRef(false);
  const cancelRef = useRef(false);

  const allSegments = book.chapters.flatMap(ch => ch.segments);
  const totalSegments = allSegments.length;
  const doneSegments = allSegments.filter(s => s.status === 'done').length;
  const errorSegments = allSegments.filter(s => s.status === 'error').length;
  const overallProgress = totalSegments > 0 ? Math.round((doneSegments / totalSegments) * 100) : 0;

  const estimatedTimeMinutes = Math.max(1, Math.round((totalSegments - doneSegments) * 3 / 60));

  const handleStartSynthesis = useCallback(async () => {
    setIsSynthesizing(true);
    setIsPaused(false);
    pauseRef.current = false;
    cancelRef.current = false;

    const updatedBook = { ...book };

    for (let ci = 0; ci < updatedBook.chapters.length; ci++) {
      const chapter = updatedBook.chapters[ci];
      if (chapter.segments.length === 0) continue;

      updatedBook.chapters[ci] = { ...chapter, status: 'synthesizing' };
      setBook({ ...updatedBook, updatedAt: Date.now() });

      for (let si = 0; si < chapter.segments.length; si++) {
        if (cancelRef.current) break;

        while (pauseRef.current) {
          await new Promise(resolve => setTimeout(resolve, 200));
          if (cancelRef.current) break;
        }
        if (cancelRef.current) break;

        const segment = chapter.segments[si];
        if (segment.status === 'done') continue;

        const role = updatedBook.roles.find(r => r.name === segment.roleName) || updatedBook.roles[0];
        const vp = voicePrints.find(v => v.id === role?.voicePrintId);
        const voiceId = vp?.cloudVoiceId || vp?.id || voicePrints[0]?.id || '';

        updatedBook.chapters[ci].segments[si] = { ...segment, status: 'synthesizing' };
        setBook({ ...updatedBook, updatedAt: Date.now() });

        try {
          const audioBlob = await voiceCloneService.synthesize(segment.text, voiceId, {
            language: 'zh-CN',
            emotion: role?.defaultEmotion || 'neutral',
            speed: role?.speedMultiplier || 1.0,
            stability: 0.5,
            similarity: 0.75,
          });

          updatedBook.chapters[ci].segments[si] = {
            ...updatedBook.chapters[ci].segments[si],
            audioBlob,
            status: 'done',
            duration: segment.text.length * 0.12,
          };
        } catch (err) {
          console.error(`Synthesis failed for segment ${si}:`, err);
          updatedBook.chapters[ci].segments[si] = {
            ...updatedBook.chapters[ci].segments[si],
            status: 'error',
          };
        }

        setBook({ ...updatedBook, updatedAt: Date.now() });
      }

      if (cancelRef.current) break;

      const allDone = updatedBook.chapters[ci].segments.every(s => s.status === 'done');
      const hasError = updatedBook.chapters[ci].segments.some(s => s.status === 'error');
      updatedBook.chapters[ci] = {
        ...updatedBook.chapters[ci],
        status: allDone ? 'done' : hasError ? 'error' : 'pending',
      };
      setBook({ ...updatedBook, updatedAt: Date.now() });
    }

    const allChaptersDone = updatedBook.chapters.every(ch => ch.status === 'done' || ch.segments.length === 0);
    updatedBook.status = allChaptersDone ? 'completed' : 'draft';
    updatedBook.totalDuration = updatedBook.chapters.reduce(
      (sum, ch) => sum + ch.segments.reduce((s, seg) => s + seg.duration, 0), 0
    );
    setBook({ ...updatedBook, updatedAt: Date.now() });
    setIsSynthesizing(false);
  }, [book, setBook, voicePrints]);

  const handlePause = () => {
    pauseRef.current = true;
    setIsPaused(true);
  };

  const handleResume = () => {
    pauseRef.current = false;
    setIsPaused(false);
  };

  if (totalSegments === 0) {
    return (
      <div className="text-center py-16">
        <Zap className="h-12 w-12 text-gray-300 mx-auto mb-3" />
        <p className="text-gray-500 text-sm">{t('audiobook.synthesize.noSegments')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4">
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-2xl font-bold text-indigo-600">{book.chapters.length}</p>
            <p className="text-xs text-gray-500">{t('audiobook.synthesize.totalChapters')}</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-indigo-600">{totalSegments}</p>
            <p className="text-xs text-gray-500">{t('audiobook.synthesize.totalSegments')}</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-indigo-600">~{estimatedTimeMinutes}m</p>
            <p className="text-xs text-gray-500">{t('audiobook.synthesize.estimatedTime')}</p>
          </div>
        </div>
      </div>

      <div className="flex space-x-3">
        {!isSynthesizing ? (
          <button
            onClick={handleStartSynthesis}
            className="flex-1 flex items-center justify-center space-x-2 py-3 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-colors"
          >
            <Play className="h-4 w-4" />
            <span>{t('audiobook.synthesize.startSynthesis')}</span>
          </button>
        ) : isPaused ? (
          <button
            onClick={handleResume}
            className="flex-1 flex items-center justify-center space-x-2 py-3 bg-green-600 text-white rounded-xl text-sm font-semibold hover:bg-green-700 transition-colors"
          >
            <Play className="h-4 w-4" />
            <span>{t('audiobook.synthesize.resume')}</span>
          </button>
        ) : (
          <button
            onClick={handlePause}
            className="flex-1 flex items-center justify-center space-x-2 py-3 bg-amber-500 text-white rounded-xl text-sm font-semibold hover:bg-amber-600 transition-colors"
          >
            <Pause className="h-4 w-4" />
            <span>{t('audiobook.synthesize.pause')}</span>
          </button>
        )}
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-700">{t('audiobook.synthesize.overallProgress')}</span>
          <span className="text-sm font-bold text-indigo-600">{overallProgress}%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2.5">
          <div
            className="bg-indigo-600 h-2.5 rounded-full transition-all duration-300"
            style={{ width: `${overallProgress}%` }}
          />
        </div>
        <div className="flex items-center space-x-4 mt-2 text-xs text-gray-400">
          <span className="flex items-center space-x-1">
            <Check className="h-3 w-3 text-green-500" />
            <span>{doneSegments} {t('audiobook.synthesize.done')}</span>
          </span>
          {errorSegments > 0 && (
            <span className="flex items-center space-x-1">
              <AlertCircle className="h-3 w-3 text-red-500" />
              <span>{errorSegments} {t('audiobook.synthesize.error')}</span>
            </span>
          )}
          <span>{totalSegments - doneSegments - errorSegments} {t('audiobook.synthesize.pending')}</span>
        </div>
      </div>

      <div className="space-y-2">
        {book.chapters.map((chapter, idx) => {
          if (chapter.segments.length === 0) return null;
          const chDone = chapter.segments.filter(s => s.status === 'done').length;
          const chTotal = chapter.segments.length;
          const chProgress = Math.round((chDone / chTotal) * 100);
          return (
            <div key={chapter.id} className="bg-white rounded-xl border border-gray-200 p-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-medium text-gray-700 truncate">
                  {t('audiobook.synthesize.chapterProgress', { index: String(idx + 1) })}: {chapter.title}
                </span>
                <div className="flex items-center space-x-2">
                  <span className="text-xs text-gray-400">{chDone}/{chTotal}</span>
                  <StatusBadge status={chapter.status} t={t} />
                </div>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-1.5">
                <div
                  className="bg-indigo-500 h-1.5 rounded-full transition-all duration-300"
                  style={{ width: `${chProgress}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
