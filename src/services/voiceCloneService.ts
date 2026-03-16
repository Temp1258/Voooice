// ---------------------------------------------------------------------------
// voiceCloneService.ts – Abstract voice-cloning service layer with
// ElevenLabs and Web Speech API implementations.
// ---------------------------------------------------------------------------

/** Options passed to every synthesis call. */
export interface SynthesisOptions {
  language: string;
  emotion: 'neutral' | 'happy' | 'sad' | 'angry' | 'excited' | 'calm';
  speed: number;
  stability: number;
  similarity: number;
}

/** Metadata returned for every cloned voice stored by a provider. */
export interface ClonedVoice {
  id: string;
  name: string;
  previewUrl?: string;
  language: string;
}

/** Every voice-cloning provider must satisfy this contract. */
export interface VoiceCloneProvider {
  /** Upload audio and create a cloned voice – returns the new voice ID. */
  cloneVoice(audioData: Blob, name: string): Promise<string>;

  /** Synthesise text with a previously-cloned voice – returns WAV/MP3 blob. */
  synthesize(
    text: string,
    voiceId: string,
    options: SynthesisOptions,
  ): Promise<Blob>;

  /** Permanently delete a cloned voice. */
  deleteVoice(voiceId: string): Promise<void>;

  /** List all voices available under the current account / provider. */
  listVoices(): Promise<ClonedVoice[]>;
}

// ---------------------------------------------------------------------------
// ElevenLabs provider – talks to the ElevenLabs REST API v1
// ---------------------------------------------------------------------------

const ELEVEN_LABS_BASE = 'https://api.elevenlabs.io';

export class ElevenLabsProvider implements VoiceCloneProvider {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  setApiKey(apiKey: string): void {
    this.apiKey = apiKey;
  }

  // -- helpers --------------------------------------------------------------

  private headers(json = false): Record<string, string> {
    const h: Record<string, string> = {
      'xi-api-key': this.apiKey,
    };
    if (json) {
      h['Content-Type'] = 'application/json';
    }
    return h;
  }

  private async assertOk(res: Response, context: string): Promise<void> {
    if (!res.ok) {
      let detail = '';
      try {
        const body = await res.json();
        detail = body?.detail?.message ?? JSON.stringify(body);
      } catch {
        detail = res.statusText;
      }
      throw new Error(
        `ElevenLabs ${context} failed (${res.status}): ${detail}`,
      );
    }
  }

  // -- interface ------------------------------------------------------------

  async cloneVoice(audioData: Blob, name: string): Promise<string> {
    const form = new FormData();
    form.append('name', name);
    form.append('files', audioData, 'voice_sample.wav');

    const res = await fetch(`${ELEVEN_LABS_BASE}/v1/voices/add`, {
      method: 'POST',
      headers: { 'xi-api-key': this.apiKey },
      body: form,
    });

    await this.assertOk(res, 'cloneVoice');
    const data: { voice_id: string } = await res.json();
    return data.voice_id;
  }

  async synthesize(
    text: string,
    voiceId: string,
    options: SynthesisOptions,
  ): Promise<Blob> {
    const body = {
      text,
      model_id: 'eleven_multilingual_v2',
      voice_settings: {
        stability: options.stability,
        similarity_boost: options.similarity,
        style: this.emotionToStyle(options.emotion),
        speed: options.speed,
        use_speaker_boost: true,
      },
    };

    const res = await fetch(
      `${ELEVEN_LABS_BASE}/v1/text-to-speech/${encodeURIComponent(voiceId)}`,
      {
        method: 'POST',
        headers: this.headers(true),
        body: JSON.stringify(body),
      },
    );

    await this.assertOk(res, 'synthesize');
    return res.blob();
  }

  async deleteVoice(voiceId: string): Promise<void> {
    const res = await fetch(
      `${ELEVEN_LABS_BASE}/v1/voices/${encodeURIComponent(voiceId)}`,
      {
        method: 'DELETE',
        headers: this.headers(),
      },
    );

    await this.assertOk(res, 'deleteVoice');
  }

  async listVoices(): Promise<ClonedVoice[]> {
    const res = await fetch(`${ELEVEN_LABS_BASE}/v1/voices`, {
      method: 'GET',
      headers: this.headers(),
    });

    await this.assertOk(res, 'listVoices');

    const data: {
      voices: Array<{
        voice_id: string;
        name: string;
        preview_url?: string;
        labels?: Record<string, string>;
      }>;
    } = await res.json();

    return data.voices.map((v) => ({
      id: v.voice_id,
      name: v.name,
      previewUrl: v.preview_url,
      language: v.labels?.language ?? 'en',
    }));
  }

  // -- internal -------------------------------------------------------------

  /** Map emotion enum to ElevenLabs "style" value (0-1 range). */
  private emotionToStyle(
    emotion: SynthesisOptions['emotion'],
  ): number {
    const map: Record<SynthesisOptions['emotion'], number> = {
      neutral: 0,
      calm: 0.15,
      happy: 0.5,
      excited: 0.8,
      sad: 0.35,
      angry: 0.7,
    };
    return map[emotion] ?? 0;
  }
}

// ---------------------------------------------------------------------------
// WebSpeechFallbackProvider – offline fallback using the Web Speech Synthesis
// API. Pitch is adjusted from the voiceprint's averagePitch value.
// ---------------------------------------------------------------------------

/** In-memory record used by the fallback provider. */
interface WebSpeechVoiceEntry {
  id: string;
  name: string;
  language: string;
  /** Average pitch extracted from the voiceprint audio (Hz). */
  averagePitch: number;
}

export class WebSpeechFallbackProvider implements VoiceCloneProvider {
  private voices: Map<string, WebSpeechVoiceEntry> = new Map();

  /**
   * "Cloning" in this provider simply stores the name and extracts a crude
   * average pitch from the audio blob so we can adjust SpeechSynthesis pitch
   * accordingly.
   */
  async cloneVoice(audioData: Blob, name: string): Promise<string> {
    const id = crypto.randomUUID();

    const averagePitch = await this.extractAveragePitch(audioData);

    this.voices.set(id, {
      id,
      name,
      language: 'en',
      averagePitch,
    });

    return id;
  }

  async synthesize(
    text: string,
    voiceId: string,
    options: SynthesisOptions,
  ): Promise<Blob> {
    const entry = this.voices.get(voiceId);
    if (!entry) {
      throw new Error(
        `WebSpeechFallbackProvider: unknown voiceId "${voiceId}"`,
      );
    }

    if (typeof window === 'undefined' || !window.speechSynthesis) {
      throw new Error(
        'WebSpeechFallbackProvider: SpeechSynthesis API is not available',
      );
    }

    return new Promise<Blob>((resolve, reject) => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = options.language || entry.language;
      utterance.rate = options.speed;

      // Map averagePitch to the Web Speech API pitch range (0.1 – 2).
      // A "typical" average pitch of ~150 Hz maps to 1.0.
      const pitchRatio = entry.averagePitch / 150;
      utterance.pitch = Math.max(0.1, Math.min(2, pitchRatio));

      // Try to pick a matching system voice.
      const systemVoices = window.speechSynthesis.getVoices();
      const match = systemVoices.find(
        (v) =>
          v.lang.startsWith(options.language) ||
          v.lang.startsWith(entry.language),
      );
      if (match) {
        utterance.voice = match;
      }

      // Web Speech API does not return audio data directly, so we resolve
      // with an empty blob and let the caller rely on the browser playing
      // the utterance natively.
      utterance.onend = () => {
        resolve(new Blob([], { type: 'audio/wav' }));
      };
      utterance.onerror = (event) => {
        reject(
          new Error(
            `WebSpeechFallbackProvider synthesis error: ${event.error}`,
          ),
        );
      };

      window.speechSynthesis.speak(utterance);
    });
  }

  async deleteVoice(voiceId: string): Promise<void> {
    if (!this.voices.has(voiceId)) {
      throw new Error(
        `WebSpeechFallbackProvider: unknown voiceId "${voiceId}"`,
      );
    }
    this.voices.delete(voiceId);
  }

  async listVoices(): Promise<ClonedVoice[]> {
    return Array.from(this.voices.values()).map((v) => ({
      id: v.id,
      name: v.name,
      language: v.language,
    }));
  }

  // -- internal -------------------------------------------------------------

  /**
   * Very rough average-pitch extractor using the Web Audio API's
   * autocorrelation on a decoded audio buffer.
   */
  private async extractAveragePitch(audioData: Blob): Promise<number> {
    try {
      const arrayBuffer = await audioData.arrayBuffer();
      const audioCtx = new OfflineAudioContext(1, 1, 44100);
      const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

      const channelData = audioBuffer.getChannelData(0);
      const sampleRate = audioBuffer.sampleRate;

      // Simple autocorrelation-based pitch detection.
      const minPeriod = Math.floor(sampleRate / 500); // 500 Hz max
      const maxPeriod = Math.floor(sampleRate / 50); // 50 Hz min
      const frameSize = Math.min(channelData.length, maxPeriod * 2);

      let bestCorrelation = -1;
      let bestPeriod = minPeriod;

      for (let period = minPeriod; period <= maxPeriod && period < frameSize; period++) {
        let correlation = 0;
        for (let i = 0; i < frameSize - period; i++) {
          correlation += channelData[i] * channelData[i + period];
        }
        if (correlation > bestCorrelation) {
          bestCorrelation = correlation;
          bestPeriod = period;
        }
      }

      const detectedPitch = sampleRate / bestPeriod;
      // Clamp to a sane range.
      return Math.max(50, Math.min(500, detectedPitch));
    } catch {
      // If decoding fails fall back to a neutral pitch.
      return 150;
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton service facade – delegates to the active provider.
// ---------------------------------------------------------------------------

class VoiceCloneService {
  private provider: VoiceCloneProvider;
  private apiKey: string | null = null;

  constructor() {
    // Default to offline fallback.
    this.provider = new WebSpeechFallbackProvider();
  }

  /** Replace the active provider entirely. */
  setProvider(provider: VoiceCloneProvider): void {
    this.provider = provider;
  }

  /**
   * Convenience helper – sets the API key and (if the current provider is
   * ElevenLabs) propagates it immediately.  If the current provider is *not*
   * ElevenLabs, it swaps in a new ElevenLabsProvider automatically.
   */
  setApiKey(apiKey: string): void {
    this.apiKey = apiKey;
    if (this.provider instanceof ElevenLabsProvider) {
      this.provider.setApiKey(apiKey);
    } else {
      this.provider = new ElevenLabsProvider(apiKey);
    }
  }

  /** Return the key that was last set (if any). */
  getApiKey(): string | null {
    return this.apiKey;
  }

  // -- proxied provider methods ---------------------------------------------

  cloneVoice(audioData: Blob, name: string): Promise<string> {
    return this.provider.cloneVoice(audioData, name);
  }

  synthesize(
    text: string,
    voiceId: string,
    options: SynthesisOptions,
  ): Promise<Blob> {
    return this.provider.synthesize(text, voiceId, options);
  }

  deleteVoice(voiceId: string): Promise<void> {
    return this.provider.deleteVoice(voiceId);
  }

  listVoices(): Promise<ClonedVoice[]> {
    return this.provider.listVoices();
  }
}

/** Application-wide singleton. */
export const voiceCloneService = new VoiceCloneService();
