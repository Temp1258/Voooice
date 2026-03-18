import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Mic, ChevronLeft, ChevronRight, Check, Save, Play, Pause,
  Clock, Heart, RotateCcw, Square,
} from 'lucide-react';
import { useI18n } from '../../i18n';
import {
  saveVoicePrint,
  saveVoicebankDraft,
  getVoicebankDraft,
  deleteVoicebankDraft,
} from '../../utils/storage';
import { extractFrequencyProfile, estimateAveragePitch } from '../../utils/audioAnalyzer';
import type { VoicePrint } from '../../types';
import { ALL_PROMPTS, QUICK_PROMPTS, getQualityStars, getSupportedMimeType, StarRating, type RecordingMode } from './shared';
import { Zap, BookOpen } from 'lucide-react';

interface GuidedRecordingTabProps {
  onVoicePrintSaved: (vp: VoicePrint) => void;
}

export function GuidedRecordingTab({ onVoicePrintSaved }: GuidedRecordingTabProps) {
  const { t, locale } = useI18n();

  // Mode state
  const [mode, setMode] = useState<RecordingMode>('quick');
  const activePrompts = mode === 'quick' ? QUICK_PROMPTS : ALL_PROMPTS;
  const totalPrompts = activePrompts.length;

  // Progress state
  const [currentIndex, setCurrentIndex] = useState(0);
  const [completedIndices, setCompletedIndices] = useState<number[]>([]);
  const [recordings, setRecordings] = useState<Record<number, ArrayBuffer>>({});
  const [hasLoadedProgress, setHasLoadedProgress] = useState(false);
  const [showResumePrompt, setShowResumePrompt] = useState(false);

  // Recording state
  const [isRecording, setIsRecording] = useState(false);
  const [currentBlob, setCurrentBlob] = useState<Blob | null>(null);
  const [currentDuration, setCurrentDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  // Save state
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [voicePrintName, setVoicePrintName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const startTimeRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const savedDraftRef = useRef<{ currentIndex: number; completedIndices: number[]; recordings: Record<number, ArrayBuffer> } | null>(null);

  // Load saved progress from IndexedDB on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const draft = await getVoicebankDraft();
        if (!cancelled && draft && draft.completedIndices.length > 0) {
          savedDraftRef.current = {
            currentIndex: draft.currentIndex,
            completedIndices: draft.completedIndices,
            recordings: draft.recordings,
          };
          setShowResumePrompt(true);
        }
      } catch {
        // ignore
      }
      if (!cancelled) setHasLoadedProgress(true);
    })();
    return () => { cancelled = true; };
  }, []);

  const handleResume = useCallback(() => {
    const draft = savedDraftRef.current;
    if (draft) {
      setCurrentIndex(draft.currentIndex);
      setCompletedIndices(draft.completedIndices);
      setRecordings(draft.recordings);
      savedDraftRef.current = null;
    }
    setShowResumePrompt(false);
  }, []);

  const handleStartFresh = useCallback(() => {
    void deleteVoicebankDraft();
    savedDraftRef.current = null;
    setShowResumePrompt(false);
    setCurrentIndex(0);
    setCompletedIndices([]);
    setRecordings({});
  }, []);

  const persistProgress = useCallback(
    (idx: number, completed: number[], recs: Record<number, ArrayBuffer>) => {
      void saveVoicebankDraft({
        currentIndex: idx,
        completedIndices: completed,
        recordings: recs,
      });
    },
    [],
  );

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });

      const mimeType = getSupportedMimeType();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, {
          type: recorder.mimeType || 'audio/webm',
        });
        setCurrentBlob(blob);
        stream.getTracks().forEach((track) => track.stop());
      };

      recorder.start(100);
      startTimeRef.current = Date.now();
      setIsRecording(true);
      setCurrentBlob(null);
      setCurrentDuration(0);

      timerRef.current = setInterval(() => {
        setCurrentDuration(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }, 500);
    } catch (err) {
      console.error('Failed to start recording:', err);
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setCurrentDuration(Math.floor((Date.now() - startTimeRef.current) / 1000));
  }, []);

  const acceptRecording = useCallback(async () => {
    if (!currentBlob) return;
    const arrayBuffer = await currentBlob.arrayBuffer();
    const newRecordings = { ...recordings, [currentIndex]: arrayBuffer };
    const newCompleted = completedIndices.includes(currentIndex)
      ? completedIndices
      : [...completedIndices, currentIndex];

    setRecordings(newRecordings);
    setCompletedIndices(newCompleted);
    setCurrentBlob(null);
    setCurrentDuration(0);
    persistProgress(currentIndex, newCompleted, newRecordings);

    if (currentIndex < totalPrompts - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  }, [currentBlob, currentIndex, completedIndices, recordings, persistProgress, totalPrompts]);

  const playCurrentRecording = useCallback(() => {
    if (!currentBlob) return;
    if (isPlaying && audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
      return;
    }
    const url = URL.createObjectURL(currentBlob);
    const audio = new Audio(url);
    audioRef.current = audio;
    audio.onended = () => {
      setIsPlaying(false);
      URL.revokeObjectURL(url);
    };
    audio.play();
    setIsPlaying(true);
  }, [currentBlob, isPlaying]);

  const handleSaveAndContinue = useCallback(() => {
    persistProgress(currentIndex, completedIndices, recordings);
    setStatusMessage(t('voicebank.progressSaved'));
    setTimeout(() => setStatusMessage(''), 2000);
  }, [currentIndex, completedIndices, recordings, persistProgress, t]);

  const handleSaveVoicePrint = useCallback(async () => {
    if (!voicePrintName.trim()) return;
    setIsSaving(true);
    setStatusMessage(t('voicebank.savingVoicePrint'));

    try {
      const sortedIndices = [...completedIndices].sort((a, b) => a - b);
      const parts: ArrayBuffer[] = [];
      for (const idx of sortedIndices) {
        const buf = recordings[idx];
        if (buf) parts.push(buf);
      }

      const combinedBlob = new Blob(parts, { type: 'audio/webm' });
      const audioContext = new AudioContext();
      const arrayBuffer = await combinedBlob.arrayBuffer();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

      const frequencyProfile = extractFrequencyProfile(audioBuffer);
      const averagePitch = estimateAveragePitch(audioBuffer);

      const vp: VoicePrint = {
        id: `vb_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        name: voicePrintName.trim(),
        createdAt: Date.now(),
        hasAudioBlob: true,
        duration: audioBuffer.duration,
        frequencyProfile,
        averagePitch,
        language: locale,
      };

      await saveVoicePrint(vp, combinedBlob);
      onVoicePrintSaved(vp);

      await deleteVoicebankDraft();
      setCompletedIndices([]);
      setRecordings({});
      setCurrentIndex(0);
      setShowSaveDialog(false);
      setVoicePrintName('');
      setStatusMessage(t('voicebank.voicePrintSaved'));

      await audioContext.close();
    } catch (err) {
      console.error('Failed to save voiceprint:', err);
      setStatusMessage('Error saving voiceprint');
    } finally {
      setIsSaving(false);
      setTimeout(() => setStatusMessage(''), 3000);
    }
  }, [voicePrintName, completedIndices, recordings, onVoicePrintSaved, t, locale]);

  if (!hasLoadedProgress) return null;

  if (showResumePrompt) {
    const savedCount = savedDraftRef.current?.completedIndices?.length ?? 0;
    return (
      <div className="bg-white rounded-2xl p-6 text-center space-y-4 border border-gray-200">
        <Heart className="h-12 w-12 text-rose-400 mx-auto" />
        <p className="text-gray-700 font-medium">
          {t('voicebank.previousProgressFound', { completed: String(savedCount) })}
        </p>
        <div className="flex gap-3 justify-center">
          <button onClick={handleResume} className="px-4 py-2 bg-rose-500 text-white rounded-xl text-sm font-medium active:bg-rose-600">
            {t('voicebank.resumeRecording')}
          </button>
          <button onClick={handleStartFresh} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium active:bg-gray-200">
            {t('voicebank.startFresh')}
          </button>
        </div>
      </div>
    );
  }

  const currentPrompt = activePrompts[currentIndex];
  const completedCount = completedIndices.length;
  const qualityStars = getQualityStars(mode === 'quick' ? completedCount * 6 : completedCount);
  const progressPercent = (completedCount / totalPrompts) * 100;

  const handleSwitchMode = (newMode: RecordingMode) => {
    if (newMode === mode) return;
    setMode(newMode);
    setCurrentIndex(0);
    setCurrentBlob(null);
    setCurrentDuration(0);
    // Keep recordings — they may overlap between modes
  };

  return (
    <div className="space-y-4">
      {/* Mode selector */}
      <div className="bg-white rounded-2xl p-3 border border-gray-200">
        <div className="flex gap-2">
          <button
            onClick={() => handleSwitchMode('quick')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-all ${
              mode === 'quick'
                ? 'bg-rose-500 text-white shadow-sm'
                : 'bg-gray-50 text-gray-600 active:bg-gray-100'
            }`}
          >
            <Zap className="h-4 w-4" />
            {t('voicebank.quickMode')}
          </button>
          <button
            onClick={() => handleSwitchMode('full')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-all ${
              mode === 'full'
                ? 'bg-rose-500 text-white shadow-sm'
                : 'bg-gray-50 text-gray-600 active:bg-gray-100'
            }`}
          >
            <BookOpen className="h-4 w-4" />
            {t('voicebank.fullMode')}
          </button>
        </div>
        <p className="text-xs text-gray-400 text-center mt-2">
          {mode === 'quick' ? t('voicebank.quickModeDesc') : t('voicebank.fullModeDesc')}
        </p>
      </div>

      {/* Progress bar */}
      <div className="bg-white rounded-2xl p-4 border border-gray-200 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-700">{t('voicebank.progress')}</span>
          <span className="text-sm text-gray-500">
            {t('voicebank.promptsCompleted', { completed: String(completedCount) })}
          </span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-3">
          <div className="bg-gradient-to-r from-rose-400 to-rose-600 h-3 rounded-full transition-all duration-500" style={{ width: `${progressPercent}%` }} />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">{t('voicebank.qualityScore')}</span>
          <StarRating stars={qualityStars} />
        </div>
      </div>

      {completedCount >= totalPrompts ? (
        <div className="bg-white rounded-2xl p-6 text-center space-y-4 border border-gray-200">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
            <Check className="h-8 w-8 text-green-600" />
          </div>
          <p className="text-lg font-semibold text-gray-900">{t('voicebank.allPromptsCompleted')}</p>
          <StarRating stars={5} />
          <button onClick={() => setShowSaveDialog(true)} className="px-6 py-3 bg-rose-500 text-white rounded-xl font-medium active:bg-rose-600">
            {t('voicebank.saveVoicePrint')}
          </button>
          {mode === 'quick' && (
            <button
              onClick={() => handleSwitchMode('full')}
              className="px-5 py-2.5 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium active:bg-gray-200"
            >
              {t('voicebank.upgradeToFull')}
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Current prompt card */}
          <div className="bg-white rounded-2xl p-5 border border-gray-200 space-y-4">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-rose-100 text-rose-700">
                {t(currentPrompt.categoryKey)}
              </span>
              <span className="text-xs text-gray-400">{currentIndex + 1} / {totalPrompts}</span>
            </div>

            {completedIndices.includes(currentIndex) && !currentBlob && !isRecording && (
              <div className="flex items-center justify-center gap-1 text-green-600 text-sm">
                <Check className="h-4 w-4" />
                <span>{t('voicebank.accept')}</span>
              </div>
            )}

            <p className="text-lg text-gray-800 leading-relaxed font-medium text-center min-h-[3.5rem]">
              {t(currentPrompt.key)}
            </p>

            <div className="flex flex-col items-center gap-3 pt-2">
              {!currentBlob ? (
                <>
                  <button
                    onClick={isRecording ? stopRecording : startRecording}
                    className={`w-16 h-16 rounded-full flex items-center justify-center transition-all ${
                      isRecording ? 'bg-red-500 animate-pulse shadow-lg shadow-red-200' : 'bg-rose-500 active:bg-rose-600 shadow-lg shadow-rose-200'
                    }`}
                  >
                    {isRecording ? <Square className="h-7 w-7 text-white" /> : <Mic className="h-7 w-7 text-white" />}
                  </button>
                  <span className="text-sm text-gray-500">
                    {isRecording ? t('voicebank.recordingDuration', { duration: String(currentDuration) }) : t('voicebank.startRecording')}
                  </span>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Clock className="h-4 w-4" />
                    {t('voicebank.recordingDuration', { duration: String(currentDuration) })}
                  </div>
                  <div className="flex gap-3">
                    <button onClick={playCurrentRecording} className="flex items-center gap-1.5 px-4 py-2 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium active:bg-gray-200">
                      {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                    </button>
                    <button onClick={() => { setCurrentBlob(null); setCurrentDuration(0); }} className="flex items-center gap-1.5 px-4 py-2 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium active:bg-gray-200">
                      <RotateCcw className="h-4 w-4" />
                      {t('voicebank.reRecord')}
                    </button>
                    <button onClick={acceptRecording} className="flex items-center gap-1.5 px-4 py-2 bg-green-500 text-white rounded-xl text-sm font-medium active:bg-green-600">
                      <Check className="h-4 w-4" />
                      {t('voicebank.accept')}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-between">
            <button
              onClick={() => { setCurrentIndex(Math.max(0, currentIndex - 1)); setCurrentBlob(null); setCurrentDuration(0); }}
              disabled={currentIndex === 0 || isRecording}
              className="flex items-center gap-1 px-3 py-2 text-sm text-gray-600 disabled:opacity-30 active:text-gray-800"
            >
              <ChevronLeft className="h-4 w-4" />
              {t('voicebank.previousPrompt')}
            </button>
            <button
              onClick={() => { setCurrentIndex(Math.min(totalPrompts - 1, currentIndex + 1)); setCurrentBlob(null); setCurrentDuration(0); }}
              disabled={currentIndex === totalPrompts - 1 || isRecording}
              className="flex items-center gap-1 px-3 py-2 text-sm text-gray-600 disabled:opacity-30 active:text-gray-800"
            >
              {t('voicebank.nextPrompt')}
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {/* Action buttons */}
          <div className="flex gap-3">
            <button onClick={handleSaveAndContinue} className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium active:bg-gray-200">
              <Save className="h-4 w-4" />
              {t('voicebank.saveAndContinueLater')}
            </button>
            {completedCount > 0 && (
              <button onClick={() => setShowSaveDialog(true)} className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-rose-500 text-white rounded-xl text-sm font-medium active:bg-rose-600">
                {t('voicebank.saveVoicePrint')}
              </button>
            )}
          </div>
        </>
      )}

      {/* Save dialog */}
      {showSaveDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm space-y-4">
            <h3 className="text-lg font-semibold text-gray-900">{t('voicebank.saveVoicePrint')}</h3>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('voicebank.voicePrintName')}</label>
              <input
                type="text"
                value={voicePrintName}
                onChange={(e) => setVoicePrintName(e.target.value)}
                placeholder={t('voicebank.enterVoicePrintName')}
                className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-rose-500 focus:border-transparent"
                maxLength={30}
              />
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowSaveDialog(false)} className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium">
                {t('common.cancel')}
              </button>
              <button
                onClick={handleSaveVoicePrint}
                disabled={!voicePrintName.trim() || isSaving}
                className="flex-1 px-4 py-2 bg-rose-500 text-white rounded-xl text-sm font-medium disabled:opacity-50"
              >
                {isSaving ? t('voicebank.savingVoicePrint') : t('common.save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Status toast */}
      {statusMessage && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-sm px-4 py-2 rounded-full shadow-lg z-50">
          {statusMessage}
        </div>
      )}
    </div>
  );
}
