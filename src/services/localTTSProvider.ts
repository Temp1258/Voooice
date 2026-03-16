// ---------------------------------------------------------------------------
// localTTSProvider.ts – VoiceCloneProvider implementation that talks to a
// local FastAPI TTS server (Fish Speech / XTTS-v2 / ChatTTS).
// ---------------------------------------------------------------------------

import type { VoiceCloneProvider, SynthesisOptions, ClonedVoice } from './voiceCloneService';

/**
 * Provider that delegates voice cloning and synthesis to a self-hosted
 * TTS server exposed over a simple REST API.
 */
export class LocalTTSProvider implements VoiceCloneProvider {
  private baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = (
      baseUrl ||
      (typeof import.meta !== 'undefined' && (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_LOCAL_TTS_URL) ||
      'http://localhost:8000'
    ).replace(/\/+$/, '');
  }

  // -- helpers --------------------------------------------------------------

  private async assertOk(res: Response, context: string): Promise<void> {
    if (!res.ok) {
      let detail = '';
      try {
        const body = await res.json();
        detail = body?.detail ?? JSON.stringify(body);
      } catch {
        detail = res.statusText;
      }
      throw new Error(
        `LocalTTS ${context} failed (${res.status}): ${detail}`,
      );
    }
  }

  /**
   * Select the best model for the given synthesis options.
   *
   * - If emotion is anything other than "neutral", use ChatTTS (it handles
   *   expressive speech well).
   * - If the language starts with "zh" (Chinese), use Fish Speech.
   * - Otherwise default to XTTS-v2.
   */
  private selectModel(options: SynthesisOptions): string {
    if (options.emotion !== 'neutral') {
      return 'chattts';
    }
    if (options.language.startsWith('zh')) {
      return 'fish-speech';
    }
    return 'xtts-v2';
  }

  // -- interface ------------------------------------------------------------

  async cloneVoice(audioData: Blob, name: string): Promise<string> {
    const form = new FormData();
    form.append('audio', audioData, 'voice_sample.wav');
    form.append('name', name);

    const res = await fetch(`${this.baseUrl}/v1/clone`, {
      method: 'POST',
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
    const model = this.selectModel(options);

    const body = {
      text,
      voice_id: voiceId,
      model,
      language: options.language,
      emotion: options.emotion,
      speed: options.speed,
      stability: options.stability,
      similarity: options.similarity,
    };

    const res = await fetch(`${this.baseUrl}/v1/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    await this.assertOk(res, 'synthesize');
    return res.blob();
  }

  async deleteVoice(voiceId: string): Promise<void> {
    const res = await fetch(
      `${this.baseUrl}/v1/voices/${encodeURIComponent(voiceId)}`,
      { method: 'DELETE' },
    );

    await this.assertOk(res, 'deleteVoice');
  }

  async listVoices(): Promise<ClonedVoice[]> {
    const res = await fetch(`${this.baseUrl}/v1/voices`, {
      method: 'GET',
    });

    await this.assertOk(res, 'listVoices');

    const data: Array<{
      id: string;
      name: string;
      language: string;
      preview_url?: string;
    }> = await res.json();

    return data.map((v) => ({
      id: v.id,
      name: v.name,
      language: v.language,
      previewUrl: v.preview_url,
    }));
  }
}
