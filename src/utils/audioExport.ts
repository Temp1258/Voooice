/**
 * Audio export utilities — supports WAV and MP3 export, plus Web Share API integration.
 */

/**
 * Encode an AudioBuffer to a WAV Blob.
 */
export function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;

  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;

  // Interleave channels
  const length = buffer.length;
  const dataLength = length * blockAlign;
  const headerLength = 44;
  const totalLength = headerLength + dataLength;

  const arrayBuffer = new ArrayBuffer(totalLength);
  const view = new DataView(arrayBuffer);

  // WAV header
  writeString(view, 0, 'RIFF');
  view.setUint32(4, totalLength - 8, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataLength, true);

  // Write interleaved samples
  const channels: Float32Array[] = [];
  for (let ch = 0; ch < numChannels; ch++) {
    channels.push(buffer.getChannelData(ch));
  }

  let offset = 44;
  for (let i = 0; i < length; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = Math.max(-1, Math.min(1, channels[ch][i]));
      const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
      view.setInt16(offset, intSample, true);
      offset += 2;
    }
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

/**
 * Convert Float32Array to Int16Array for MP3 encoding.
 */
function floatTo16BitPCM(float32: Float32Array): Int16Array {
  const int16 = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  return int16;
}

/**
 * Encode an AudioBuffer to a real MP3 Blob using lamejs.
 * Falls back to WAV if lamejs is not available.
 */
export async function audioBufferToMp3(buffer: AudioBuffer): Promise<Blob> {
  try {
    const { Mp3Encoder } = await import('lamejs');
    const sampleRate = buffer.sampleRate;
    const numChannels = Math.min(2, buffer.numberOfChannels);
    const kbps = 128;
    const encoder = new Mp3Encoder(numChannels, sampleRate, kbps);

    const left = floatTo16BitPCM(buffer.getChannelData(0));
    const right = numChannels === 2
      ? floatTo16BitPCM(buffer.getChannelData(1))
      : left;

    const mp3Parts: Int8Array[] = [];
    const blockSize = 1152;

    for (let i = 0; i < left.length; i += blockSize) {
      const leftChunk = left.subarray(i, i + blockSize);
      const rightChunk = right.subarray(i, i + blockSize);
      const mp3buf = encoder.encodeBuffer(leftChunk, rightChunk);
      if (mp3buf.length > 0) {
        mp3Parts.push(mp3buf);
      }
    }

    const lastBuf = encoder.flush();
    if (lastBuf.length > 0) {
      mp3Parts.push(lastBuf);
    }

    return new Blob(mp3Parts, { type: 'audio/mp3' });
  } catch {
    // Fall back to WAV if lamejs fails to load
    console.warn('MP3 encoding unavailable, falling back to WAV');
    return audioBufferToWav(buffer);
  }
}

/**
 * Trigger a file download in the browser.
 */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Share audio using the Web Share API (available on iOS Safari, Android Chrome).
 * Falls back to download if sharing isn't supported.
 */
export async function shareAudio(
  blob: Blob,
  filename: string,
  title: string,
  text?: string
): Promise<boolean> {
  if (navigator.canShare) {
    const file = new File([blob], filename, { type: blob.type || 'audio/wav' });
    const shareData: ShareData = {
      title,
      text: text || title,
      files: [file],
    };

    if (navigator.canShare(shareData)) {
      try {
        await navigator.share(shareData);
        return true;
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') {
          return false;
        }
      }
    }
  }

  downloadBlob(blob, filename);
  return true;
}

/**
 * Export synthesized audio with metadata.
 */
export async function exportSynthesizedAudio(
  audioBlob: Blob,
  voiceName: string,
  text: string,
  format: 'wav' | 'mp3' = 'wav'
): Promise<void> {
  const timestamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
  const safeName = voiceName.replace(/[^\w\u4e00-\u9fff]/g, '_').slice(0, 20);
  const filename = `Voooice_${safeName}_${timestamp}.${format}`;

  downloadBlob(audioBlob, filename);
}
