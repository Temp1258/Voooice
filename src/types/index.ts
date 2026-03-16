export interface VoicePrint {
  id: string;
  name: string;
  createdAt: number;
  /** Base64-encoded audio samples used for voiceprint */
  audioData: string;
  /** Duration of recording in seconds */
  duration: number;
  /** Extracted frequency profile for visualization */
  frequencyProfile: number[];
  /** Average pitch in Hz */
  averagePitch: number;
  /** Language used during recording */
  language: string;
}

export interface SynthesisRequest {
  text: string;
  voicePrintId: string;
}

export interface SynthesisResult {
  audioBlob: Blob;
  duration: number;
}

export type AppView = 'home' | 'record' | 'voiceprints' | 'speak';

export type RecordingState = 'idle' | 'recording' | 'processing' | 'done' | 'error';

export type SpeakingState = 'idle' | 'synthesizing' | 'speaking' | 'error';
