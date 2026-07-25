import React, { useEffect, useRef } from "react";
import { AudioEngine } from "../../core/collab/AudioEngine";

interface CanvasVisualizerProps {
  audioEngine: AudioEngine;
  active: boolean;
  onClose: () => void;
}

export const CanvasVisualizer: React.FC<CanvasVisualizerProps> = ({ audioEngine, active, onClose }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number | null>(null);

  useEffect(() => {
    if (!active) {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const render = () => {
      const data = audioEngine.getAudioData();
      const w = canvas.width;
      const h = canvas.height;

      // Dark background with dynamic opacity
      ctx.fillStyle = `rgba(10, 10, 20, 0.25)`;
      ctx.fillRect(0, 0, w, h);

      // Radial bass pulse
      const radius = Math.min(w, h) * (0.2 + data.bass * 0.35);
      const gradient = ctx.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, radius);
      
      const hue = (Date.now() / 30 + data.high * 120) % 360;
      gradient.addColorStop(0, `hsla(${hue}, 80%, 60%, ${0.3 + data.level * 0.5})`);
      gradient.addColorStop(0.5, `hsla(${(hue + 60) % 360}, 70%, 40%, ${0.15 + data.bass * 0.3})`);
      gradient.addColorStop(1, "transparent");

      ctx.save();
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Beat flash
      if (data.isBeat) {
        ctx.fillStyle = `rgba(255, 255, 255, ${0.1 + data.bass * 0.25})`;
        ctx.fillRect(0, 0, w, h);
      }

      animFrameRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener("resize", resize);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [active, audioEngine]);

  if (!active) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center animate-fade-in overflow-hidden">
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />
      <div className="relative z-10 text-center space-y-4">
        <h2 className="text-3xl font-black tracking-widest text-primary glow-text uppercase">Canvas Visualizer</h2>
        <p className="text-xs opacity-60">Audio-reactive immersive space</p>
        <button className="btn btn-outline btn-sm rounded-full px-6" onClick={onClose}>
          Exit Canvas
        </button>
      </div>
    </div>
  );
};
