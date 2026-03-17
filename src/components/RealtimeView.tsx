import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Mic, Square, Activity, ChevronDown, AlertCircle, Gauge } from 'lucide-react';
import { RealtimeVoiceConverter } from '../services/realtimeVoiceService';
import type { VoicePrint } from '../types';

interface RealtimeViewProps {
  voicePrints: VoicePrint[];
}

type RealtimeState = 'idle' | 'starting' | 'active' | 'error';

export function RealtimeView({ voicePrints }: RealtimeViewProps) {
  const [selectedVPId, setSelectedVPId] = useState<string>(voicePrints[0]?.id || '');
  const [showDropdown, setShowDropdown] = useState(false);
  const [state, setState] = useState<RealtimeState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [pitchFactor, setPitchFactor] = useState(1.0);
  const [latency, setLatency] = useState(0);

  const converterRef = useRef<RealtimeVoiceConverter>(new RealtimeVoiceConverter());
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number>(0);
  const latencyIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const selectedVP = voicePrints.find(vp => vp.id === selectedVPId);

  // Compute a pitch factor from the voiceprint's average pitch.
  // A "neutral" pitch of ~150 Hz maps to 1.0.
  useEffect(() => {
    if (selectedVP) {
      const factor = selectedVP.averagePitch > 0
        ? Math.max(0.5, Math.min(2.0, selectedVP.averagePitch / 150))
        : 1.0;
      setPitchFactor(factor);

      // Update live if converter is running
      if (converterRef.current.isRunning) {
        converterRef.current.setTargetVoice(selectedVP.cloudVoiceId || selectedVP.id, factor);
      }
    }
  }, [selectedVPId, selectedVP]);

  const drawVisualization = useCallback(() => {
    const canvas = canvasRef.current;
    const analyser = analyserRef.current;
    if (!canvas || !analyser) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      animFrameRef.current = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(dataArray);

      const { width } = canvas.getBoundingClientRect();
      canvas.width = width * 2;
      canvas.height = 160;
      ctx.scale(2, 2);

      const w = width;
      const h = 80;

      ctx.clearRect(0, 0, w, h);

      const barCount = 64;
      const barWidth = w / barCount - 1;
      const step = Math.floor(bufferLength / barCount);

      for (let i = 0; i < barCount; i++) {
        const value = dataArray[i * step] / 255;
        const barHeight = value * h * 0.9;

        const hue = 240 + value * 60; // blue to purple
        ctx.fillStyle = `hsla(${hue}, 80%, 60%, ${0.6 + value * 0.4})`;
        ctx.fillRect(
          i * (barWidth + 1),
          h - barHeight,
          barWidth,
          barHeight,
        );
      }
    };

    draw();
  }, []);

  const handleStart = async () => {
    if (!selectedVP) return;

    setError(null);
    setState('starting');

    try {
      const inputStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      const voiceId = selectedVP.cloudVoiceId || selectedVP.id;
      const outputStream = await converterRef.current.start(
        inputStream,
        voiceId,
        pitchFactor,
      );

      // Play the converted audio through speakers
      const audioEl = new Audio();
      audioEl.srcObject = outputStream;
      audioEl.play().catch(() => {});
      audioElRef.current = audioEl;

      // Set up an analyser for visualization on the output stream
      const audioCtx = new AudioContext();
      const source = audioCtx.createMediaStreamSource(outputStream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      setState('active');
      drawVisualization();

      // Poll latency
      latencyIntervalRef.current = setInterval(() => {
        setLatency(converterRef.current.getLatency());
      }, 500);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setState('error');
    }
  };

  const handleStop = useCallback(() => {
    converterRef.current.stop();

    if (audioElRef.current) {
      audioElRef.current.pause();
      audioElRef.current.srcObject = null;
      audioElRef.current = null;
    }

    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = 0;
    }

    if (latencyIntervalRef.current) {
      clearInterval(latencyIntervalRef.current);
      latencyIntervalRef.current = null;
    }

    analyserRef.current = null;
    setLatency(0);
    setState('idle');
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (converterRef.current.isRunning) {
        converterRef.current.stop();
      }
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
      if (latencyIntervalRef.current) {
        clearInterval(latencyIntervalRef.current);
      }
    };
  }, []);

  const handlePitchChange = (newFactor: number) => {
    setPitchFactor(newFactor);
    if (converterRef.current.isRunning && selectedVP) {
      converterRef.current.setTargetVoice(
        selectedVP.cloudVoiceId || selectedVP.id,
        newFactor,
      );
    }
  };

  if (voicePrints.length === 0) {
    return (
      <div className="text-center py-16">
        <Mic className="h-16 w-16 text-gray-300 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-gray-500">暂无可用声纹</h3>
        <p className="text-gray-400 text-sm mt-1">请先录制声音并保存声纹</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="text-center">
        <h2 className="text-xl font-bold text-gray-900 mb-1">实时变声</h2>
        <p className="text-gray-500 text-sm">选择目标声纹，实时转换你的声音</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start space-x-3">
          <AlertCircle className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Voice selection */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4">
        <label className="text-sm font-medium text-gray-700 mb-2 block">
          目标声纹
        </label>
        <div className="relative">
          <button
            onClick={() => setShowDropdown(!showDropdown)}
            disabled={state === 'active'}
            className="w-full border border-gray-300 rounded-xl px-4 py-3 text-left flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60"
          >
            {selectedVP ? (
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center">
                  <Activity className="h-4 w-4 text-indigo-600" />
                </div>
                <div>
                  <p className="font-medium text-gray-900">{selectedVP.name}</p>
                  <p className="text-xs text-gray-400">
                    {selectedVP.averagePitch} Hz · {selectedVP.duration}s
                    {selectedVP.cloudVoiceId && ' · 云端'}
                  </p>
                </div>
              </div>
            ) : (
              <span className="text-gray-400">请选择声纹</span>
            )}
            <ChevronDown className="h-5 w-5 text-gray-400" />
          </button>

          {showDropdown && (
            <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
              {voicePrints.map((vp) => (
                <button
                  key={vp.id}
                  onClick={() => {
                    setSelectedVPId(vp.id);
                    setShowDropdown(false);
                  }}
                  className={`w-full px-4 py-3 text-left flex items-center space-x-3 transition-colors ${
                    vp.id === selectedVPId ? 'bg-indigo-50' : 'active:bg-gray-100'
                  }`}
                >
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center ${
                      vp.id === selectedVPId ? 'bg-indigo-200' : 'bg-gray-100'
                    }`}
                  >
                    <Activity
                      className={`h-4 w-4 ${
                        vp.id === selectedVPId ? 'text-indigo-600' : 'text-gray-500'
                      }`}
                    />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">{vp.name}</p>
                    <p className="text-xs text-gray-400">{vp.averagePitch} Hz</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Pitch control */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4">
        <div className="flex justify-between items-center mb-2">
          <label className="text-sm font-medium text-gray-700">音高调节</label>
          <span className="text-xs text-gray-400">{pitchFactor.toFixed(2)}x</span>
        </div>
        <input
          type="range"
          min="0.5"
          max="2.0"
          step="0.05"
          value={pitchFactor}
          onChange={(e) => handlePitchChange(parseFloat(e.target.value))}
          className="w-full accent-indigo-600"
        />
        <div className="flex justify-between text-xs text-gray-400 mt-1">
          <span>低沉</span>
          <span>原始</span>
          <span>尖锐</span>
        </div>
      </div>

      {/* Visualization */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4">
        <div className="bg-gray-900 rounded-xl p-3 mb-4">
          {state === 'active' ? (
            <canvas
              ref={canvasRef}
              style={{ width: '100%', height: '80px' }}
              className="rounded-lg"
            />
          ) : (
            <div className="h-20 flex items-center justify-center">
              <div className="flex items-center space-x-1">
                {Array.from({ length: 40 }).map((_, i) => (
                  <div
                    key={i}
                    className="w-1 bg-gray-700 rounded-full"
                    style={{ height: `${4 + Math.random() * 8}px` }}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Latency indicator */}
        {state === 'active' && (
          <div className="flex items-center justify-center space-x-2 text-xs text-gray-400 mb-4">
            <Gauge className="h-3 w-3" />
            <span>延迟: {latency.toFixed(1)} ms</span>
          </div>
        )}

        {/* Start / Stop button */}
        <div className="flex justify-center">
          {state === 'idle' || state === 'error' ? (
            <button
              onClick={handleStart}
              disabled={!selectedVPId}
              className="w-20 h-20 bg-indigo-600 rounded-full flex items-center justify-center active:bg-indigo-700 transition-colors shadow-lg shadow-indigo-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Mic className="h-8 w-8 text-white" />
            </button>
          ) : state === 'starting' ? (
            <button
              disabled
              className="w-20 h-20 bg-indigo-400 rounded-full flex items-center justify-center shadow-lg animate-pulse"
            >
              <Mic className="h-8 w-8 text-white" />
            </button>
          ) : (
            <button
              onClick={handleStop}
              className="w-20 h-20 bg-red-500 rounded-full flex items-center justify-center active:bg-red-600 transition-colors shadow-lg shadow-red-500/30 animate-pulse"
            >
              <Square className="h-8 w-8 text-white" />
            </button>
          )}
        </div>

        <p className="text-center text-sm text-gray-400 mt-4">
          {state === 'idle' && '点击开始实时变声'}
          {state === 'starting' && '正在启动...'}
          {state === 'active' && '正在实时转换，点击红色按钮停止'}
          {state === 'error' && '发生错误，请重试'}
        </p>
      </div>

      <div className="bg-amber-50 rounded-xl p-4 text-sm text-amber-700">
        <p className="font-medium mb-1">使用提示</p>
        <p>
          建议使用耳机以避免回声。实时变声基于本地音高偏移处理，
          如需更高保真的云端声音克隆，请在设置中配置 API Key。
        </p>
      </div>
    </div>
  );
}
