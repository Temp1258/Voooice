import React, { useRef, useEffect } from 'react';

interface WaveformVisualizerProps {
  analyserNode: AnalyserNode | null;
  isActive: boolean;
  color?: string;
  height?: number;
}

export function WaveformVisualizer({
  analyserNode,
  isActive,
  color = '#6366f1',
  height = 80,
}: WaveformVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !analyserNode || !isActive) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bufferLength = analyserNode.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      animationRef.current = requestAnimationFrame(draw);

      analyserNode.getByteTimeDomainData(dataArray);

      const { width } = canvas.getBoundingClientRect();
      canvas.width = width * 2;
      canvas.height = height * 2;
      ctx.scale(2, 2); // Retina

      ctx.fillStyle = 'transparent';
      ctx.clearRect(0, 0, width, height);

      ctx.lineWidth = 2;
      ctx.strokeStyle = color;
      ctx.beginPath();

      const sliceWidth = width / bufferLength;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i] / 128.0;
        const y = (v * height) / 2;

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
        x += sliceWidth;
      }

      ctx.lineTo(width, height / 2);
      ctx.stroke();
    };

    draw();

    return () => {
      cancelAnimationFrame(animationRef.current);
    };
  }, [analyserNode, isActive, color, height]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: '100%', height: `${height}px` }}
      className="rounded-lg"
    />
  );
}
