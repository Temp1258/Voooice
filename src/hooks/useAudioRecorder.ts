import { useState, useRef, useCallback } from 'react';
import type { RecordingState } from '../types';
import { PCMCollector } from '../utils/wavEncoder';

interface UseAudioRecorderReturn {
  state: RecordingState;
  duration: number;
  audioBuffer: AudioBuffer | null;
  analyserNode: AnalyserNode | null;
  startRecording: () => Promise<void>;
  stopRecording: () => void;
  reset: () => void;
  error: string | null;
}

/**
 * Detect the best supported MIME type for MediaRecorder.
 *
 * Priority:
 *   1. audio/mp4           — best iOS Safari support
 *   2. audio/webm;codecs=opus — best Chrome / Firefox support
 *   3. audio/webm          — generic WebM
 *   4. null                — no MediaRecorder support; use WAV fallback
 */
function getSupportedMimeType(): string | null {
  if (typeof MediaRecorder === 'undefined') return null;

  const candidates = [
    'audio/mp4',
    'audio/webm;codecs=opus',
    'audio/webm',
  ];

  for (const mime of candidates) {
    if (MediaRecorder.isTypeSupported(mime)) {
      return mime;
    }
  }

  return null;
}

export function useAudioRecorder(): UseAudioRecorderReturn {
  const [state, setState] = useState<RecordingState>('idle');
  const [duration, setDuration] = useState(0);
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const [analyserNode, setAnalyserNode] = useState<AnalyserNode | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const pcmCollectorRef = useRef<PCMCollector | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  /** Clean up timer, stream tracks, and processor nodes */
  const cleanup = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (scriptProcessorRef.current) {
      scriptProcessorRef.current.disconnect();
      scriptProcessorRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }, []);

  /**
   * Decode a recorded Blob into an AudioBuffer.
   */
  const decodeBlob = useCallback(
    async (blob: Blob, audioContext: AudioContext): Promise<AudioBuffer> => {
      const arrayBuffer = await blob.arrayBuffer();
      return audioContext.decodeAudioData(arrayBuffer);
    },
    []
  );

  const startRecording = useCallback(async () => {
    try {
      setError(null);
      setState('recording');
      chunksRef.current = [];
      pcmCollectorRef.current = null;

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100,
        },
      });
      streamRef.current = stream;

      const audioContext = new AudioContext({ sampleRate: 44100 });
      audioContextRef.current = audioContext;

      // Create analyser for real-time visualization
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 2048;
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);
      setAnalyserNode(analyser);

      const mimeType = getSupportedMimeType();

      if (mimeType) {
        // ── MediaRecorder path (mp4 / webm) ──────────────────────────
        const mediaRecorder = new MediaRecorder(stream, { mimeType });

        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            chunksRef.current.push(event.data);
          }
        };

        mediaRecorder.onstop = async () => {
          setState('processing');
          cleanup();

          try {
            const blob = new Blob(chunksRef.current, { type: mimeType });
            const decoded = await decodeBlob(blob, audioContext);
            setAudioBuffer(decoded);
            setState('done');
          } catch (err) {
            console.error('Failed to decode audio:', err);
            setError('音频解码失败，请重试');
            setState('error');
          }
        };

        mediaRecorderRef.current = mediaRecorder;
        mediaRecorder.start(100); // Collect data every 100ms
      } else {
        // ── WAV fallback via ScriptProcessor (no MediaRecorder support) ──
        const collector = new PCMCollector(audioContext.sampleRate);
        pcmCollectorRef.current = collector;

        const bufferSize = 4096;
        const scriptProcessor = audioContext.createScriptProcessor(
          bufferSize,
          1,
          1
        );
        scriptProcessorRef.current = scriptProcessor;

        scriptProcessor.onaudioprocess = (event) => {
          const inputData = event.inputBuffer.getChannelData(0);
          collector.addChunk(inputData);
        };

        // Connect: source -> analyser -> scriptProcessor -> destination
        analyser.connect(scriptProcessor);
        scriptProcessor.connect(audioContext.destination);
      }

      // Duration timer
      startTimeRef.current = Date.now();
      timerRef.current = window.setInterval(() => {
        setDuration(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }, 200);
    } catch (err: any) {
      console.error('Failed to start recording:', err);
      if (err.name === 'NotAllowedError') {
        setError('请允许麦克风访问权限');
      } else if (err.name === 'NotFoundError') {
        setError('未找到麦克风设备');
      } else {
        setError('录音启动失败: ' + (err.message || '未知错误'));
      }
      setState('error');
    }
  }, [cleanup, decodeBlob]);

  const stopRecording = useCallback(() => {
    // MediaRecorder path
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== 'inactive'
    ) {
      mediaRecorderRef.current.stop();
      return;
    }

    // WAV fallback path
    if (pcmCollectorRef.current && audioContextRef.current) {
      setState('processing');
      cleanup();

      try {
        const wavBlob = pcmCollectorRef.current.toWAVBlob();
        const audioContext = audioContextRef.current;

        // Decode the WAV blob into an AudioBuffer
        wavBlob
          .arrayBuffer()
          .then((buf) => audioContext.decodeAudioData(buf))
          .then((decoded) => {
            setAudioBuffer(decoded);
            setState('done');
          })
          .catch((err) => {
            console.error('Failed to decode WAV audio:', err);
            setError('音频解码失败，请重试');
            setState('error');
          });
      } catch (err) {
        console.error('WAV encoding failed:', err);
        setError('音频编码失败，请重试');
        setState('error');
      }
    }
  }, [cleanup]);

  const reset = useCallback(() => {
    setState('idle');
    setDuration(0);
    setAudioBuffer(null);
    setAnalyserNode(null);
    setError(null);
    cleanup();
    pcmCollectorRef.current = null;
    mediaRecorderRef.current = null;
  }, [cleanup]);

  return {
    state,
    duration,
    audioBuffer,
    analyserNode,
    startRecording,
    stopRecording,
    reset,
    error,
  };
}
