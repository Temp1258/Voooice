/**
 * Real-time WAV encoder for use as a MediaRecorder fallback.
 *
 * When the browser does not support audio/mp4 or audio/webm (e.g. older
 * iOS Safari versions), we can capture raw PCM from the Web Audio API
 * ScriptProcessor / AudioWorklet and encode it as WAV manually.
 */

function writeString(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

/**
 * Encode interleaved PCM Float32 samples into a WAV ArrayBuffer.
 */
export function encodeWAV(
  samples: Float32Array,
  sampleRate: number,
  numChannels: number = 1
): ArrayBuffer {
  const bytesPerSample = 2; // 16-bit PCM
  const dataLength = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(buffer);

  // RIFF header
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataLength, true);
  writeString(view, 8, 'WAVE');

  // fmt subchunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // subchunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * bytesPerSample, true);
  view.setUint16(32, numChannels * bytesPerSample, true);
  view.setUint16(34, 16, true); // bits per sample

  // data subchunk
  writeString(view, 36, 'data');
  view.setUint32(40, dataLength, true);

  // Write PCM samples (clamp to [-1, 1])
  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }

  return buffer;
}

/**
 * A simple class that collects raw PCM chunks from a ScriptProcessorNode
 * and produces a WAV Blob when stopped.
 *
 * Usage:
 *   const collector = new PCMCollector(sampleRate);
 *   scriptProcessor.onaudioprocess = (e) => {
 *     collector.addChunk(e.inputBuffer.getChannelData(0));
 *   };
 *   // later:
 *   const wavBlob = collector.toWAVBlob();
 */
export class PCMCollector {
  private chunks: Float32Array[] = [];
  private sampleRate: number;

  constructor(sampleRate: number) {
    this.sampleRate = sampleRate;
  }

  addChunk(pcmData: Float32Array): void {
    // Copy so the buffer isn't reused by the audio system
    this.chunks.push(new Float32Array(pcmData));
  }

  getTotalLength(): number {
    return this.chunks.reduce((sum, c) => sum + c.length, 0);
  }

  toWAVBlob(): Blob {
    const totalLength = this.getTotalLength();
    const merged = new Float32Array(totalLength);
    let offset = 0;
    for (const chunk of this.chunks) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }

    const wavBuffer = encodeWAV(merged, this.sampleRate);
    return new Blob([wavBuffer], { type: 'audio/wav' });
  }

  reset(): void {
    this.chunks = [];
  }
}
