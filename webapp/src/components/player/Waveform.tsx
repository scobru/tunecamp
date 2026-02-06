import { useRef, useEffect, useMemo } from 'react';

interface WaveformProps {
    data: number[] | string | null | undefined;
    progress: number; // 0-1
    height?: number;
    colorPlayed?: string;
    colorRemaining?: string;
}

export const Waveform = ({ 
    data, 
    progress, 
    height = 64,
    colorPlayed = '#1db954',
    colorRemaining = 'rgba(255, 255, 255, 0.15)' 
}: WaveformProps) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    // Parse data safely and memoize
    const waveformData = useMemo(() => {
        if (!data) return null;
        try {
            return typeof data === 'string' ? JSON.parse(data) : data;
        } catch (e) {
            console.error("Failed to parse waveform data", e);
            return null;
        }
    }, [data]);

    const draw = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        
        if (canvas.width !== rect.width * dpr || canvas.height !== rect.height * dpr) {
            canvas.width = rect.width * dpr;
            canvas.height = rect.height * dpr;
        }

        const width = canvas.width;
        const heightPX = canvas.height;
        
        ctx.clearRect(0, 0, width, heightPX);

        if (!waveformData || !Array.isArray(waveformData) || waveformData.length === 0) {
           return;
        }

        const barWidth = 2 * dpr;
        const gap = 1 * dpr;
        const totalBars = Math.floor(width / (barWidth + gap));
        const step = waveformData.length / totalBars;
        
        for (let i = 0; i < totalBars; i++) {
            const dataIndex = Math.floor(i * step);
            const value = waveformData[dataIndex] || 0;
            
            const barHeight = Math.max(2 * dpr, value * heightPX * 0.9);
            const x = i * (barWidth + gap);
            const y = (heightPX - barHeight) / 2;

            const barPercent = i / totalBars;
            ctx.fillStyle = barPercent < progress ? colorPlayed : colorRemaining;
            
            const radius = 1 * dpr;
            ctx.beginPath();
            ctx.roundRect(x, y, barWidth, barHeight, radius);
            ctx.fill();
        }
    };

    useEffect(() => {
        draw();
    }, [waveformData, progress, colorPlayed, colorRemaining]);

    if (!waveformData) return null;

    return (
        <canvas 
            ref={canvasRef}
            className="w-full h-full pointer-events-none select-none"
            style={{ height: `${height}px`, display: 'block' }}
        />
    );
};
