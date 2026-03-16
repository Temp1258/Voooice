// ---------------------------------------------------------------------------
// azureVoiceProvider.ts – Azure Custom Neural Voice provider implementing
// the VoiceCloneProvider interface.
// ---------------------------------------------------------------------------

import type {
  VoiceCloneProvider,
  SynthesisOptions,
  ClonedVoice,
} from './voiceCloneService';

/** Configuration required to initialise the Azure provider. */
export interface AzureVoiceConfig {
  /** Azure Speech Services subscription key. */
  subscriptionKey: string;
  /** Azure region, e.g. "eastus", "westeurope". */
  region: string;
  /** Optional custom endpoint for sovereign clouds / private endpoints. */
  customEndpoint?: string;
}

/** Shape returned by the Azure Custom Voice training / profile APIs. */
interface AzureVoiceProfile {
  id: string;
  name: string;
  locale: string;
  status: 'NotStarted' | 'Running' | 'Succeeded' | 'Failed';
}

/** Shape of the Azure voices list response. */
interface AzureVoiceListItem {
  Name: string;
  ShortName: string;
  Locale: string;
  LocaleName: string;
  VoiceType: string;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export class AzureVoiceProvider implements VoiceCloneProvider {
  private subscriptionKey: string;
  private region: string;
  private customEndpoint?: string;

  /** Base URL for the REST API. */
  private get baseUrl(): string {
    return (
      this.customEndpoint ??
      `https://${this.region}.customvoice.api.speech.microsoft.com`
    );
  }

  /** Token endpoint used for speech synthesis. */
  private get tokenUrl(): string {
    return `https://${this.region}.api.cognitive.microsoft.com/sts/v1.0/issueToken`;
  }

  /** TTS endpoint. */
  private get ttsUrl(): string {
    return `https://${this.region}.tts.speech.microsoft.com/cognitiveservices/v1`;
  }

  constructor(config: AzureVoiceConfig) {
    this.subscriptionKey = config.subscriptionKey;
    this.region = config.region;
    this.customEndpoint = config.customEndpoint;
  }

  // -- helpers --------------------------------------------------------------

  private commonHeaders(): Record<string, string> {
    return {
      'Ocp-Apim-Subscription-Key': this.subscriptionKey,
    };
  }

  private async assertOk(res: Response, context: string): Promise<void> {
    if (!res.ok) {
      let detail = '';
      try {
        const body = await res.json();
        detail =
          body?.error?.message ?? body?.message ?? JSON.stringify(body);
      } catch {
        detail = res.statusText;
      }
      throw new Error(`Azure ${context} failed (${res.status}): ${detail}`);
    }
  }

  /** Obtain a short-lived bearer token for the TTS endpoint. */
  private async fetchAccessToken(): Promise<string> {
    const res = await fetch(this.tokenUrl, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': this.subscriptionKey,
        'Content-Length': '0',
      },
    });

    if (!res.ok) {
      throw new Error(
        `Azure token fetch failed (${res.status}): ${res.statusText}`,
      );
    }

    return res.text();
  }

  // -- interface ------------------------------------------------------------

  /**
   * Create a custom neural voice profile from an audio sample.
   *
   * Azure Custom Neural Voice requires a more involved training pipeline in
   * practice (consent, datasets, model training) but this method wraps the
   * simplified "personal voice" / profile creation endpoint.
   */
  async cloneVoice(audioData: Blob, name: string): Promise<string> {
    const form = new FormData();
    form.append('displayName', name);
    form.append('description', `Custom voice profile: ${name}`);
    form.append(
      'audioData',
      audioData,
      'voice_sample.wav',
    );

    const res = await fetch(
      `${this.baseUrl}/api/texttospeech/v3.0/endpoints`,
      {
        method: 'POST',
        headers: this.commonHeaders(),
        body: form,
      },
    );

    await this.assertOk(res, 'cloneVoice');

    const profile: AzureVoiceProfile = await res.json();
    return profile.id;
  }

  /**
   * Synthesise speech from text using SSML and the Azure TTS REST endpoint.
   */
  async synthesize(
    text: string,
    voiceId: string,
    options: SynthesisOptions,
  ): Promise<Blob> {
    const token = await this.fetchAccessToken();
    const ssml = this.buildSsml(text, voiceId, options);

    const res = await fetch(this.ttsUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/ssml+xml',
        'X-Microsoft-OutputFormat': 'audio-24khz-96kbitrate-mono-mp3',
        'User-Agent': 'VocalText/1.0',
      },
      body: ssml,
    });

    await this.assertOk(res, 'synthesize');
    return res.blob();
  }

  /** Delete a custom voice profile / endpoint. */
  async deleteVoice(voiceId: string): Promise<void> {
    const res = await fetch(
      `${this.baseUrl}/api/texttospeech/v3.0/endpoints/${encodeURIComponent(voiceId)}`,
      {
        method: 'DELETE',
        headers: this.commonHeaders(),
      },
    );

    await this.assertOk(res, 'deleteVoice');
  }

  /** List available voices (both built-in and custom neural voices). */
  async listVoices(): Promise<ClonedVoice[]> {
    const token = await this.fetchAccessToken();

    const res = await fetch(
      `https://${this.region}.tts.speech.microsoft.com/cognitiveservices/voices/list`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    );

    await this.assertOk(res, 'listVoices');

    const items: AzureVoiceListItem[] = await res.json();

    return items.map((v) => ({
      id: v.ShortName,
      name: v.Name,
      language: v.Locale,
    }));
  }

  // -- SSML builder ---------------------------------------------------------

  private buildSsml(
    text: string,
    voiceId: string,
    options: SynthesisOptions,
  ): string {
    const lang = options.language || 'en-US';
    const rate = this.speedToSsmlRate(options.speed);
    const emotionTag = this.emotionToSsml(options.emotion);
    const escapedText = this.escapeXml(text);

    // If an emotion is specified use <mstts:express-as>.
    const innerContent = emotionTag
      ? `<mstts:express-as style="${emotionTag}">${escapedText}</mstts:express-as>`
      : escapedText;

    return [
      `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis"`,
      `  xmlns:mstts="https://www.w3.org/2001/mstts"`,
      `  xml:lang="${lang}">`,
      `  <voice name="${this.escapeXml(voiceId)}">`,
      `    <prosody rate="${rate}">`,
      `      ${innerContent}`,
      `    </prosody>`,
      `  </voice>`,
      `</speak>`,
    ].join('\n');
  }

  /** Convert numeric speed (e.g. 1.0) to SSML rate string. */
  private speedToSsmlRate(speed: number): string {
    if (speed === 1) return 'default';
    const pct = Math.round((speed - 1) * 100);
    return pct >= 0 ? `+${pct}%` : `${pct}%`;
  }

  /** Map our emotion enum to Azure SSML express-as style values. */
  private emotionToSsml(
    emotion: SynthesisOptions['emotion'],
  ): string | null {
    const map: Record<SynthesisOptions['emotion'], string | null> = {
      neutral: null,
      happy: 'cheerful',
      sad: 'sad',
      angry: 'angry',
      excited: 'excited',
      calm: 'calm',
    };
    return map[emotion] ?? null;
  }

  /** Minimal XML escaping for SSML text content. */
  private escapeXml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}
