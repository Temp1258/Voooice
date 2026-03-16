import React, { useState } from 'react';
import { Mic, Square, RotateCcw, Save, AlertCircle } from 'lucide-react';
import { useAudioRecorder } from '../hooks/useAudioRecorder';
import { WaveformVisualizer } from './WaveformVisualizer';
import { FrequencyProfile } from './FrequencyProfile';
import { extractFrequencyProfile, estimateAveragePitch, audioBufferToBlob } from '../utils/audioAnalyzer';
import { saveVoicePrint, updateVoicePrint } from '../utils/storage';
import { voiceCloneService } from '../services/voiceCloneService';
import { useI18n } from '../i18n';
import type { VoicePrint } from '../types';

interface RecordViewProps {
  onSaved: (vp: VoicePrint) => void;
}

export function RecordView({ onSaved }: RecordViewProps) {
  const { t } = useI18n();
  const {
    state,
    duration,
    audioBuffer,
    analyserNode,
    startRecording,
    stopRecording,
    reset,
    error,
  } = useAudioRecorder();

  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [frequencyProfile, setFrequencyProfile] = useState<number[]>([]);
  const [averagePitch, setAveragePitch] = useState(0);
  const [cloudUploadStatus, setCloudUploadStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle');
  const [cloudUploadError, setCloudUploadError] = useState<string | null>(null);

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const handleStop = () => {
    stopRecording();
    // Analysis will happen after state transitions to 'done'
  };

  // Process audio when recording is done
  React.useEffect(() => {
    if (state === 'done' && audioBuffer) {
      const profile = extractFrequencyProfile(audioBuffer);
      const pitch = estimateAveragePitch(audioBuffer);
      setFrequencyProfile(profile);
      setAveragePitch(pitch);
    }
  }, [state, audioBuffer]);

  const handleSave = async () => {
    if (!audioBuffer || !name.trim()) return;

    setSaving(true);
    setCloudUploadStatus('idle');
    setCloudUploadError(null);

    try {
      const audioBlob = audioBufferToBlob(audioBuffer);
      const voiceprint: VoicePrint = {
        id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
        name: name.trim(),
        createdAt: Date.now(),
        hasAudioBlob: true,
        duration,
        frequencyProfile,
        averagePitch,
        language: 'zh-CN',
      };

      // Save locally first
      await saveVoicePrint(voiceprint, audioBlob);

      // If an API key is configured, upload to ElevenLabs to get a cloudVoiceId
      const apiKey = voiceCloneService.getApiKey();
      if (apiKey) {
        setCloudUploadStatus('uploading');
        try {
          const cloudVoiceId = await voiceCloneService.cloneVoice(audioBlob, voiceprint.name);
          // Persist the cloudVoiceId back to IndexedDB
          await updateVoicePrint(voiceprint.id, { cloudVoiceId });
          voiceprint.cloudVoiceId = cloudVoiceId;
          setCloudUploadStatus('success');
        } catch (uploadErr: unknown) {
          const msg = uploadErr instanceof Error ? uploadErr.message : String(uploadErr);
          console.error('Cloud voice clone failed:', msg);
          setCloudUploadError(msg);
          setCloudUploadStatus('error');
          // Local save succeeded, so we still call onSaved
        }
      }

      onSaved(voiceprint);
    } catch (err) {
      console.error('Failed to save voiceprint:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    reset();
    setName('');
    setFrequencyProfile([]);
    setAveragePitch(0);
    setCloudUploadStatus('idle');
    setCloudUploadError(null);
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-xl font-bold text-gray-900 mb-1">{t('record.title')}</h2>
        <p className="text-gray-500 text-sm">
          {t('record.description')}
        </p>
      </div>

      {/* Error display */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start space-x-3">
          <AlertCircle className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Recording area */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
        {/* Waveform */}
        <div className="bg-gray-50 rounded-xl p-3 mb-6">
          {state === 'recording' ? (
            <WaveformVisualizer
              analyserNode={analyserNode}
              isActive={true}
              color="#ef4444"
              height={80}
            />
          ) : (
            <div className="h-20 flex items-center justify-center">
              <div className="flex items-center space-x-1">
                {Array.from({ length: 40 }).map((_, i) => (
                  <div
                    key={i}
                    className={`w-1 rounded-full transition-all duration-500 ${
                      state === 'done' ? 'bg-green-400' : 'bg-gray-300'
                    }`}
                    style={{
                      height: state === 'done'
                        ? `${Math.max(4, (frequencyProfile[i] || 0) * 60)}px`
                        : `${4 + Math.random() * 8}px`,
                    }}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Timer */}
        <div className="text-center mb-6">
          <span className="text-4xl font-mono font-bold text-gray-900">
            {formatDuration(duration)}
          </span>
          <p className="text-sm text-gray-400 mt-1">
            {state === 'idle' && t('record.stateReady')}
            {state === 'recording' && t('record.stateRecording')}
            {state === 'processing' && t('record.stateProcessing')}
            {state === 'done' && t('record.stateDone')}
            {state === 'error' && t('record.stateError')}
          </p>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-center space-x-6">
          {state === 'idle' || state === 'error' ? (
            <button
              onClick={startRecording}
              className="w-20 h-20 bg-red-500 rounded-full flex items-center justify-center active:bg-red-600 transition-colors shadow-lg shadow-red-500/30"
            >
              <Mic className="h-8 w-8 text-white" />
            </button>
          ) : state === 'recording' ? (
            <button
              onClick={handleStop}
              className="w-20 h-20 bg-red-500 rounded-full flex items-center justify-center active:bg-red-600 transition-colors shadow-lg shadow-red-500/30 animate-pulse"
            >
              <Square className="h-8 w-8 text-white" />
            </button>
          ) : state === 'done' ? (
            <>
              <button
                onClick={handleReset}
                className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center active:bg-gray-200 transition-colors"
              >
                <RotateCcw className="h-6 w-6 text-gray-600" />
              </button>
            </>
          ) : null}
        </div>
      </div>

      {/* Analysis result & Save */}
      {state === 'done' && audioBuffer && (
        <div className="space-y-4">
          {/* Voice analysis */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5">
            <h3 className="font-semibold text-gray-900 mb-3">{t('record.analysisTitle')}</h3>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="bg-indigo-50 rounded-xl p-3 text-center">
                <p className="text-2xl font-bold text-indigo-600">{averagePitch} Hz</p>
                <p className="text-xs text-indigo-400">{t('record.averagePitch')}</p>
              </div>
              <div className="bg-purple-50 rounded-xl p-3 text-center">
                <p className="text-2xl font-bold text-purple-600">{duration}s</p>
                <p className="text-xs text-purple-400">{t('record.duration')}</p>
              </div>
            </div>

            <FrequencyProfile
              profile={frequencyProfile}
              color="#6366f1"
              height={50}
              label={t('record.frequencyProfile')}
            />
          </div>

          {/* Save form */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5">
            <h3 className="font-semibold text-gray-900 mb-3">{t('record.saveVoiceprint')}</h3>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('record.namePlaceholder')}
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              maxLength={30}
            />
            <button
              onClick={handleSave}
              disabled={!name.trim() || saving}
              className="w-full mt-3 bg-indigo-600 text-white rounded-xl py-3 font-semibold flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed active:bg-indigo-700 transition-colors"
            >
              <Save className="h-5 w-5" />
              <span>
                {saving
                  ? cloudUploadStatus === 'uploading'
                    ? t('record.uploadingToCloud')
                    : t('record.saving')
                  : t('record.saveVoiceprint')}
              </span>
            </button>
            {cloudUploadStatus === 'success' && (
              <p className="text-xs text-green-600 mt-2 text-center">
                {t('record.cloudSyncSuccess')}
              </p>
            )}
            {cloudUploadStatus === 'error' && cloudUploadError && (
              <p className="text-xs text-amber-600 mt-2 text-center">
                {t('record.localSaveSuccessCloudFailed')}: {cloudUploadError}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
