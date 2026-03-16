import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Mic, MicOff, ChevronLeft, ChevronRight, Check, Save, Play, Pause,
  Star, Shield, Mail, Clock, Lock, Heart, RotateCcw, Volume2, Send,
  Info, Square,
} from 'lucide-react';
import { useI18n } from '../i18n';
import { saveVoicePrint } from '../utils/storage';
import { extractFrequencyProfile, estimateAveragePitch } from '../utils/audioAnalyzer';
import type { VoicePrint } from '../types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface VoiceBankViewProps {
  voicePrints: VoicePrint[];
  onVoicePrintSaved: (vp: VoicePrint) => void;
}

type TabId = 'guided' | 'vault' | 'legacy';

interface PromptItem {
  key: string;
  category: string;
  categoryKey: string;
}

interface LegacySetting {
  voicePrintId: string;
  heirName: string;
  transferTrigger: 'manual' | 'auto';
  accessLevel: 'listen' | 'synthesize' | 'full';
}

interface RecordingProgress {
  currentIndex: number;
  completedIndices: number[];
  /** Base-64 encoded audio data for each completed index */
  recordings: Record<number, string>;
}

// ---------------------------------------------------------------------------
// Prompt definitions (50 prompts, 5 categories x 10)
// ---------------------------------------------------------------------------

function buildPrompts(): PromptItem[] {
  const categories: { category: string; categoryKey: string; prefix: string }[] = [
    { category: 'daily', categoryKey: 'voicebank.category.daily', prefix: 'voicebank.prompt.daily' },
    { category: 'emotional', categoryKey: 'voicebank.category.emotional', prefix: 'voicebank.prompt.emotional' },
    { category: 'narrative', categoryKey: 'voicebank.category.narrative', prefix: 'voicebank.prompt.narrative' },
    { category: 'clarity', categoryKey: 'voicebank.category.clarity', prefix: 'voicebank.prompt.clarity' },
    { category: 'personal', categoryKey: 'voicebank.category.personal', prefix: 'voicebank.prompt.personal' },
  ];

  const prompts: PromptItem[] = [];
  for (const cat of categories) {
    for (let i = 1; i <= 10; i++) {
      prompts.push({
        key: `${cat.prefix}${i}`,
        category: cat.category,
        categoryKey: cat.categoryKey,
      });
    }
  }
  return prompts;
}

const ALL_PROMPTS = buildPrompts();
const PROGRESS_KEY = 'vocaltext_voicebank_progress';
const LEGACY_KEY = 'vocaltext_voice_legacy';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getQualityStars(completedCount: number): number {
  if (completedCount >= 41) return 5;
  if (completedCount >= 31) return 4;
  if (completedCount >= 21) return 3;
  if (completedCount >= 11) return 2;
  if (completedCount >= 1) return 1;
  return 0;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1]); // strip data-url prefix
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function base64ToBlob(b64: string, type = 'audio/webm'): Blob {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type });
}

function getSupportedMimeType(): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  const candidates = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'];
  for (const mime of candidates) {
    if (MediaRecorder.isTypeSupported(mime)) return mime;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Star rating display
// ---------------------------------------------------------------------------

function StarRating({ stars, max = 5 }: { stars: number; max?: number }) {
  return (
    <span className="inline-flex gap-0.5">
      {Array.from({ length: max }).map((_, i) => (
        <Star
          key={i}
          className={`h-4 w-4 ${i < stars ? 'text-amber-400 fill-amber-400' : 'text-gray-300'}`}
        />
      ))}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function VoiceBankView({ voicePrints, onVoicePrintSaved }: VoiceBankViewProps) {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<TabId>('guided');

  const tabs: { id: TabId; label: string }[] = [
    { id: 'guided', label: t('voicebank.guidedRecording') },
    { id: 'vault', label: t('voicebank.voiceVault') },
    { id: 'legacy', label: t('voicebank.voiceLegacy') },
  ];

  return (
    <div className="space-y-4">
      {/* Tab bar */}
      <div className="flex rounded-xl bg-gray-100 p-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 py-2 px-3 text-sm font-medium rounded-lg transition-colors ${
              activeTab === tab.id
                ? 'bg-white text-rose-600 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'guided' && (
        <GuidedRecordingTab onVoicePrintSaved={onVoicePrintSaved} />
      )}
      {activeTab === 'vault' && <VoiceVaultTab voicePrints={voicePrints} />}
      {activeTab === 'legacy' && <VoiceLegacyTab voicePrints={voicePrints} />}
    </div>
  );
}

// ===========================================================================
// Tab 1: Guided Recording
// ===========================================================================

function GuidedRecordingTab({
  onVoicePrintSaved,
}: {
  onVoicePrintSaved: (vp: VoicePrint) => void;
}) {
  const { t } = useI18n();

  // Progress state
  const [currentIndex, setCurrentIndex] = useState(0);
  const [completedIndices, setCompletedIndices] = useState<number[]>([]);
  const [recordings, setRecordings] = useState<Record<number, string>>({});
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
  const savedProgressRef = useRef<RecordingProgress | null>(null);

  // Load saved progress on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(PROGRESS_KEY);
      if (saved) {
        const progress: RecordingProgress = JSON.parse(saved);
        if (progress.completedIndices && progress.completedIndices.length > 0) {
          savedProgressRef.current = progress;
          setShowResumePrompt(true);
        }
      }
    } catch {
      // ignore
    }
    setHasLoadedProgress(true);
  }, []);

  const handleResume = useCallback(() => {
    const progress = savedProgressRef.current;
    if (progress) {
      setCurrentIndex(progress.currentIndex);
      setCompletedIndices(progress.completedIndices);
      setRecordings(progress.recordings || {});
      savedProgressRef.current = null;
    }
    setShowResumePrompt(false);
  }, []);

  const handleStartFresh = useCallback(() => {
    localStorage.removeItem(PROGRESS_KEY);
    savedProgressRef.current = null;
    setShowResumePrompt(false);
    setCurrentIndex(0);
    setCompletedIndices([]);
    setRecordings({});
  }, []);

  // Save progress to localStorage
  const persistProgress = useCallback(
    (idx: number, completed: number[], recs: Record<number, string>) => {
      const progress: RecordingProgress = {
        currentIndex: idx,
        completedIndices: completed,
        recordings: recs,
      };
      try {
        localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
      } catch {
        // storage quota exceeded - acceptable
      }
    },
    [],
  );

  // Recording controls
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
    const b64 = await blobToBase64(currentBlob);
    const newRecordings = { ...recordings, [currentIndex]: b64 };
    const newCompleted = completedIndices.includes(currentIndex)
      ? completedIndices
      : [...completedIndices, currentIndex];

    setRecordings(newRecordings);
    setCompletedIndices(newCompleted);
    setCurrentBlob(null);
    setCurrentDuration(0);
    persistProgress(currentIndex, newCompleted, newRecordings);

    // Auto-advance to next incomplete prompt
    if (currentIndex < ALL_PROMPTS.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  }, [currentBlob, currentIndex, completedIndices, recordings, persistProgress]);

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

  // Save & Continue Later
  const handleSaveAndContinue = useCallback(() => {
    persistProgress(currentIndex, completedIndices, recordings);
    setStatusMessage(t('voicebank.progressSaved'));
    setTimeout(() => setStatusMessage(''), 2000);
  }, [currentIndex, completedIndices, recordings, persistProgress, t]);

  // Save voiceprint
  const handleSaveVoicePrint = useCallback(async () => {
    if (!voicePrintName.trim()) return;
    setIsSaving(true);
    setStatusMessage(t('voicebank.savingVoicePrint'));

    try {
      // Combine all recorded blobs into one
      const blobs: Blob[] = [];
      const sortedIndices = [...completedIndices].sort((a, b) => a - b);
      for (const idx of sortedIndices) {
        const b64 = recordings[idx];
        if (b64) {
          blobs.push(base64ToBlob(b64));
        }
      }

      const combinedBlob = new Blob(blobs, { type: blobs[0]?.type || 'audio/webm' });

      // Decode to AudioBuffer for analysis
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
        language: 'zh-CN',
      };

      await saveVoicePrint(vp, combinedBlob);
      onVoicePrintSaved(vp);

      // Clean up progress
      localStorage.removeItem(PROGRESS_KEY);
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
  }, [voicePrintName, completedIndices, recordings, onVoicePrintSaved, t]);

  if (!hasLoadedProgress) return null;

  // Resume prompt
  if (showResumePrompt) {
    const savedCount = savedProgressRef.current?.completedIndices?.length ?? 0;
    return (
      <div className="bg-white rounded-2xl p-6 text-center space-y-4 border border-gray-200">
        <Heart className="h-12 w-12 text-rose-400 mx-auto" />
        <p className="text-gray-700 font-medium">
          {t('voicebank.previousProgressFound', { completed: String(savedCount) })}
        </p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={handleResume}
            className="px-4 py-2 bg-rose-500 text-white rounded-xl text-sm font-medium active:bg-rose-600"
          >
            {t('voicebank.resumeRecording')}
          </button>
          <button
            onClick={handleStartFresh}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium active:bg-gray-200"
          >
            {t('voicebank.startFresh')}
          </button>
        </div>
      </div>
    );
  }

  const currentPrompt = ALL_PROMPTS[currentIndex];
  const completedCount = completedIndices.length;
  const qualityStars = getQualityStars(completedCount);
  const progressPercent = (completedCount / 50) * 100;

  return (
    <div className="space-y-4">
      {/* Progress bar */}
      <div className="bg-white rounded-2xl p-4 border border-gray-200 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-700">{t('voicebank.progress')}</span>
          <span className="text-sm text-gray-500">
            {t('voicebank.promptsCompleted', { completed: String(completedCount) })}
          </span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-3">
          <div
            className="bg-gradient-to-r from-rose-400 to-rose-600 h-3 rounded-full transition-all duration-500"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">{t('voicebank.qualityScore')}</span>
          <StarRating stars={qualityStars} />
        </div>
      </div>

      {completedCount >= 50 ? (
        /* All done */
        <div className="bg-white rounded-2xl p-6 text-center space-y-4 border border-gray-200">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
            <Check className="h-8 w-8 text-green-600" />
          </div>
          <p className="text-lg font-semibold text-gray-900">
            {t('voicebank.allPromptsCompleted')}
          </p>
          <StarRating stars={5} />
          <button
            onClick={() => setShowSaveDialog(true)}
            className="px-6 py-3 bg-rose-500 text-white rounded-xl font-medium active:bg-rose-600"
          >
            {t('voicebank.saveVoicePrint')}
          </button>
        </div>
      ) : (
        <>
          {/* Current prompt card */}
          <div className="bg-white rounded-2xl p-5 border border-gray-200 space-y-4">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-rose-100 text-rose-700">
                {t(currentPrompt.categoryKey)}
              </span>
              <span className="text-xs text-gray-400">
                {currentIndex + 1} / 50
              </span>
            </div>

            {/* Completed indicator */}
            {completedIndices.includes(currentIndex) && !currentBlob && !isRecording && (
              <div className="flex items-center justify-center gap-1 text-green-600 text-sm">
                <Check className="h-4 w-4" />
                <span>{t('voicebank.accept')}</span>
              </div>
            )}

            <p className="text-lg text-gray-800 leading-relaxed font-medium text-center min-h-[3.5rem]">
              {t(currentPrompt.key)}
            </p>

            {/* Recording controls */}
            <div className="flex flex-col items-center gap-3 pt-2">
              {!currentBlob ? (
                <>
                  <button
                    onClick={isRecording ? stopRecording : startRecording}
                    className={`w-16 h-16 rounded-full flex items-center justify-center transition-all ${
                      isRecording
                        ? 'bg-red-500 animate-pulse shadow-lg shadow-red-200'
                        : 'bg-rose-500 active:bg-rose-600 shadow-lg shadow-rose-200'
                    }`}
                  >
                    {isRecording ? (
                      <Square className="h-7 w-7 text-white" />
                    ) : (
                      <Mic className="h-7 w-7 text-white" />
                    )}
                  </button>
                  <span className="text-sm text-gray-500">
                    {isRecording
                      ? t('voicebank.recordingDuration', { duration: String(currentDuration) })
                      : t('voicebank.startRecording')}
                  </span>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Clock className="h-4 w-4" />
                    {t('voicebank.recordingDuration', { duration: String(currentDuration) })}
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={playCurrentRecording}
                      className="flex items-center gap-1.5 px-4 py-2 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium active:bg-gray-200"
                    >
                      {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                    </button>
                    <button
                      onClick={() => {
                        setCurrentBlob(null);
                        setCurrentDuration(0);
                      }}
                      className="flex items-center gap-1.5 px-4 py-2 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium active:bg-gray-200"
                    >
                      <RotateCcw className="h-4 w-4" />
                      {t('voicebank.reRecord')}
                    </button>
                    <button
                      onClick={acceptRecording}
                      className="flex items-center gap-1.5 px-4 py-2 bg-green-500 text-white rounded-xl text-sm font-medium active:bg-green-600"
                    >
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
              onClick={() => {
                setCurrentIndex(Math.max(0, currentIndex - 1));
                setCurrentBlob(null);
                setCurrentDuration(0);
              }}
              disabled={currentIndex === 0 || isRecording}
              className="flex items-center gap-1 px-3 py-2 text-sm text-gray-600 disabled:opacity-30 active:text-gray-800"
            >
              <ChevronLeft className="h-4 w-4" />
              {t('voicebank.previousPrompt')}
            </button>
            <button
              onClick={() => {
                setCurrentIndex(Math.min(ALL_PROMPTS.length - 1, currentIndex + 1));
                setCurrentBlob(null);
                setCurrentDuration(0);
              }}
              disabled={currentIndex === ALL_PROMPTS.length - 1 || isRecording}
              className="flex items-center gap-1 px-3 py-2 text-sm text-gray-600 disabled:opacity-30 active:text-gray-800"
            >
              {t('voicebank.nextPrompt')}
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {/* Action buttons */}
          <div className="flex gap-3">
            <button
              onClick={handleSaveAndContinue}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium active:bg-gray-200"
            >
              <Save className="h-4 w-4" />
              {t('voicebank.saveAndContinueLater')}
            </button>
            {completedCount > 0 && (
              <button
                onClick={() => setShowSaveDialog(true)}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-rose-500 text-white rounded-xl text-sm font-medium active:bg-rose-600"
              >
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
            <h3 className="text-lg font-semibold text-gray-900">
              {t('voicebank.saveVoicePrint')}
            </h3>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('voicebank.voicePrintName')}
              </label>
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
              <button
                onClick={() => setShowSaveDialog(false)}
                className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium"
              >
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

// ===========================================================================
// Tab 2: Voice Vault
// ===========================================================================

function VoiceVaultTab({ voicePrints }: { voicePrints: VoicePrint[] }) {
  const { t } = useI18n();
  const [letterTarget, setLetterTarget] = useState<string | null>(null);
  const [letterText, setLetterText] = useState('');

  if (voicePrints.length === 0) {
    return (
      <div className="bg-white rounded-2xl p-8 text-center border border-gray-200 space-y-3">
        <Heart className="h-16 w-16 text-rose-300 mx-auto" />
        <h3 className="text-lg font-semibold text-gray-700">{t('voicebank.vault.empty')}</h3>
        <p className="text-sm text-gray-400">{t('voicebank.vault.emptySubtext')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {voicePrints.map((vp) => {
        const stars = getQualityStars(Math.min(50, Math.ceil(vp.duration / 5)));
        const dateStr = new Date(vp.createdAt).toLocaleDateString();
        const isLetterOpen = letterTarget === vp.id;

        return (
          <div
            key={vp.id}
            className="bg-white rounded-2xl p-4 border border-gray-200 space-y-3"
          >
            <div className="flex items-start justify-between">
              <div>
                <h4 className="font-semibold text-gray-900">{vp.name}</h4>
                <p className="text-xs text-gray-400 mt-0.5">
                  {t('voicebank.vault.recordedOn', { date: dateStr })}
                </p>
              </div>
              {vp.encryptionIv && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-green-100 text-green-700">
                  <Shield className="h-3 w-3" />
                  {t('voicebank.vault.encrypted')}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">{t('voicebank.vault.quality')}</span>
              <StarRating stars={stars} />
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => {
                  // Synthesize test phrase using browser TTS as demo
                  const utterance = new SpeechSynthesisUtterance(
                    t('voicebank.vault.testPhrase'),
                  );
                  utterance.lang = vp.language || 'zh-CN';
                  speechSynthesis.speak(utterance);
                }}
                className="flex items-center gap-1.5 px-3 py-2 bg-rose-50 text-rose-600 rounded-xl text-xs font-medium active:bg-rose-100"
              >
                <Volume2 className="h-3.5 w-3.5" />
                {t('voicebank.vault.listen')}
              </button>
              <button
                onClick={() => {
                  setLetterTarget(isLetterOpen ? null : vp.id);
                  setLetterText('');
                }}
                className="flex items-center gap-1.5 px-3 py-2 bg-indigo-50 text-indigo-600 rounded-xl text-xs font-medium active:bg-indigo-100"
              >
                <Mail className="h-3.5 w-3.5" />
                {t('voicebank.vault.writeLetter')}
              </button>
            </div>

            {isLetterOpen && (
              <div className="space-y-2 pt-1">
                <textarea
                  value={letterText}
                  onChange={(e) => setLetterText(e.target.value)}
                  placeholder={t('voicebank.vault.letterPlaceholder')}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm resize-none h-24 focus:ring-2 focus:ring-rose-500 focus:border-transparent"
                />
                <button
                  onClick={() => {
                    if (!letterText.trim()) return;
                    const utterance = new SpeechSynthesisUtterance(letterText);
                    utterance.lang = vp.language || 'zh-CN';
                    speechSynthesis.speak(utterance);
                  }}
                  disabled={!letterText.trim()}
                  className="flex items-center gap-1.5 px-4 py-2 bg-rose-500 text-white rounded-xl text-sm font-medium disabled:opacity-50 active:bg-rose-600"
                >
                  <Send className="h-4 w-4" />
                  {t('voicebank.vault.synthesize')}
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ===========================================================================
// Tab 3: Voice Legacy
// ===========================================================================

function VoiceLegacyTab({ voicePrints }: { voicePrints: VoicePrint[] }) {
  const { t } = useI18n();
  const [settings, setSettings] = useState<LegacySetting[]>([]);
  const [statusMessage, setStatusMessage] = useState('');

  // Load settings
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LEGACY_KEY);
      if (saved) {
        setSettings(JSON.parse(saved));
      }
    } catch {
      // ignore
    }
  }, []);

  // Ensure every voiceprint has a legacy setting entry
  useEffect(() => {
    setSettings((prev) => {
      const existing = new Set(prev.map((s) => s.voicePrintId));
      const additions: LegacySetting[] = voicePrints
        .filter((vp) => !existing.has(vp.id))
        .map((vp) => ({
          voicePrintId: vp.id,
          heirName: '',
          transferTrigger: 'manual' as const,
          accessLevel: 'listen' as const,
        }));
      return additions.length > 0 ? [...prev, ...additions] : prev;
    });
  }, [voicePrints]);

  const updateSetting = (vpId: string, updates: Partial<LegacySetting>) => {
    setSettings((prev) =>
      prev.map((s) => (s.voicePrintId === vpId ? { ...s, ...updates } : s)),
    );
  };

  const handleSave = () => {
    try {
      localStorage.setItem(LEGACY_KEY, JSON.stringify(settings));
      setStatusMessage(t('voicebank.legacy.settingsSaved'));
      setTimeout(() => setStatusMessage(''), 2000);
    } catch {
      // ignore
    }
  };

  if (voicePrints.length === 0) {
    return (
      <div className="bg-white rounded-2xl p-8 text-center border border-gray-200 space-y-3">
        <Lock className="h-12 w-12 text-gray-300 mx-auto" />
        <p className="text-sm text-gray-400">{t('voicebank.legacy.noVoices')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Info box */}
      <div className="bg-rose-50 rounded-2xl p-4 flex gap-3">
        <Info className="h-5 w-5 text-rose-400 flex-shrink-0 mt-0.5" />
        <p className="text-sm text-rose-700 leading-relaxed">
          {t('voicebank.legacy.description')}
        </p>
      </div>

      {/* Per-voice settings */}
      {voicePrints.map((vp) => {
        const setting = settings.find((s) => s.voicePrintId === vp.id) || {
          voicePrintId: vp.id,
          heirName: '',
          transferTrigger: 'manual' as const,
          accessLevel: 'listen' as const,
        };

        return (
          <div
            key={vp.id}
            className="bg-white rounded-2xl p-4 border border-gray-200 space-y-4"
          >
            <h4 className="font-semibold text-gray-900">{vp.name}</h4>

            {/* Heir designation */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                {t('voicebank.legacy.heirName')}
              </label>
              <input
                type="text"
                value={setting.heirName}
                onChange={(e) => updateSetting(vp.id, { heirName: e.target.value })}
                placeholder={t('voicebank.legacy.heirPlaceholder')}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-rose-500 focus:border-transparent"
                maxLength={50}
              />
            </div>

            {/* Transfer trigger */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-2">
                {t('voicebank.legacy.transferTrigger')}
              </label>
              <div className="space-y-2">
                {(['manual', 'auto'] as const).map((trigger) => (
                  <label key={trigger} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name={`trigger-${vp.id}`}
                      checked={setting.transferTrigger === trigger}
                      onChange={() => updateSetting(vp.id, { transferTrigger: trigger })}
                      className="text-rose-500 focus:ring-rose-500"
                    />
                    <span className="text-sm text-gray-700">
                      {trigger === 'manual'
                        ? t('voicebank.legacy.manualOnly')
                        : t('voicebank.legacy.autoTransfer')}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {/* Access level */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-2">
                {t('voicebank.legacy.accessLevel')}
              </label>
              <div className="space-y-2">
                {(['listen', 'synthesize', 'full'] as const).map((level) => (
                  <label key={level} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name={`access-${vp.id}`}
                      checked={setting.accessLevel === level}
                      onChange={() => updateSetting(vp.id, { accessLevel: level })}
                      className="text-rose-500 focus:ring-rose-500"
                    />
                    <span className="text-sm text-gray-700">
                      {level === 'listen'
                        ? t('voicebank.legacy.listenOnly')
                        : level === 'synthesize'
                          ? t('voicebank.legacy.canSynthesize')
                          : t('voicebank.legacy.fullControl')}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        );
      })}

      {/* Save button */}
      <button
        onClick={handleSave}
        className="w-full py-3 bg-rose-500 text-white rounded-xl font-medium active:bg-rose-600"
      >
        {t('voicebank.legacy.saveSettings')}
      </button>

      {/* Status toast */}
      {statusMessage && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-sm px-4 py-2 rounded-full shadow-lg z-50">
          {statusMessage}
        </div>
      )}
    </div>
  );
}
