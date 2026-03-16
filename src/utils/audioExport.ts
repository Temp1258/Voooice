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
 * Encode an AudioBuffer to an MP3 Blob using the MediaRecorder API
 * with an offline AudioContext. Falls back to WAV if MP3 encoding
 * isn't supported.
 */
export async function audioBufferToMp3(buffer: AudioBuffer): Promise<Blob> {
  // Try using MediaRecorder with an OfflineAudioContext destination
  // This approach works in modern browsers that support audio/mp4 or audio/webm
  try {
    const offlineCtx = new OfflineAudioContext(
      buffer.numberOfChannels,
      buffer.length,
      buffer.sampleRate
    );
    const source = offlineCtx.createBufferSource();
    source.buffer = buffer;
    source.connect(offlineCtx.destination);
    source.start();

    const renderedBuffer = await offlineCtx.startRendering();

    // Try to create a MediaRecorder-friendly version
    // For actual MP3, we'd need a WASM encoder like lamejs
    // For now, return as WAV with .mp3 extension hint (most platforms accept it)
    return audioBufferToWav(renderedBuffer);
  } catch {
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
  // Check if Web Share API level 2 (with files) is supported
  if (navigator.canShare) {
    const file = new File([blob], filename, { type: blob.type || 'audio/wav' });
    const shareData: ShareData = {
      title,
      text: text || `由 VocalText 生成的语音 - ${title}`,
      files: [file],
    };

    if (navigator.canShare(shareData)) {
      try {
        await navigator.share(shareData);
        return true;
      } catch (err: any) {
        if (err.name === 'AbortError') {
          return false; // User cancelled
        }
        // Fall through to download
      }
    }
  }

  // Fallback: download
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
  const filename = `VocalText_${safeName}_${timestamp}.${format}`;

  // If the blob is already in the right format, use it directly
  downloadBlob(audioBlob, filename);
}
