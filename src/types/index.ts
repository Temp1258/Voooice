export interface VoicePrint {
  id: string;
  name: string;
  createdAt: number;
  /** Whether an audio blob is stored in the audioBlobs object store */
  hasAudioBlob: boolean;
  /** Duration of recording in seconds */
  duration: number;
  /** Extracted frequency profile for visualization */
  frequencyProfile: number[];
  /** Average pitch in Hz */
  averagePitch: number;
  /** Language used during recording */
  language: string;
  /** Mapped cloud voice ID (ElevenLabs / Azure) */
  cloudVoiceId?: string;
  /** Base64-encoded IV used for encrypted audio blob */
  encryptionIv?: string;
}

export interface SynthesisRequest {
  text: string;
  voicePrintId: string;
}

export interface SynthesisResult {
  audioBlob: Blob;
  duration: number;
}

export type AppView = 'home' | 'record' | 'voiceprints' | 'speak' | 'marketplace' | 'settings' | 'realtime' | 'training' | 'audiobook' | 'dialogue' | 'apidocs' | 'pricing' | 'voicebank';

export type RecordingState = 'idle' | 'recording' | 'processing' | 'done' | 'error';

export type SpeakingState = 'idle' | 'synthesizing' | 'speaking' | 'error';

export interface UserProfile {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string;
  plan: 'free' | 'pro' | 'enterprise';
  voiceQuota: number;
  usedQuota: number;
}

export interface AuthState {
  isAuthenticated: boolean;
  user: UserProfile | null;
  token: string | null;
  loading: boolean;
}

export interface CloudSyncStatus {
  lastSynced: number | null;
  syncing: boolean;
  error: string | null;
}

export interface MarketplaceVoice {
  id: string;
  name: string;
  authorName: string;
  description: string;
  previewUrl: string;
  price: number;
  currency: string;
  downloads: number;
  rating: number;
  language: string;
  tags: string[];
}

export type EmotionType = 'neutral' | 'happy' | 'sad' | 'angry' | 'excited' | 'calm';

// Audiobook Workbench types
export interface AudioBook {
  id: string;
  title: string;
  author: string;
  coverUrl?: string;
  chapters: Chapter[];
  roles: VoiceRole[];
  defaultNarratorId: string;
  createdAt: number;
  updatedAt: number;
  totalDuration: number;
  status: 'draft' | 'synthesizing' | 'completed' | 'published';
}

export interface Chapter {
  id: string;
  title: string;
  order: number;
  rawText: string;
  ssmlText?: string;
  segments: ChapterSegment[];
  bgmTrackUrl?: string;
  status: 'pending' | 'synthesizing' | 'done' | 'error';
}

export interface ChapterSegment {
  id: string;
  text: string;
  roleName: string;
  emotion: EmotionType;
  audioBlob?: Blob;
  duration: number;
  order: number;
  status: 'pending' | 'synthesizing' | 'done' | 'error';
}

export interface VoiceRole {
  id: string;
  name: string;
  voicePrintId: string;
  defaultEmotion: EmotionType;
  speedMultiplier: number;
  color: string;
}

export type AudioExportFormat = 'wav' | 'mp3' | 'ogg';
