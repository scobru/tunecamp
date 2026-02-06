import { useRef, useEffect, useState } from 'react';

interface WaveformProps {
    data: number[] | string | null | undefined;
    progress: number; // 0-1
    onSeek: (percent: number) => void;
    height?: number;
    colorPlayed?: string;
    colorRemaining?: string;
}

export const Waveform = ({ 
    data, 
    progress, 
    onSeek,
    height = 64,
    colorPlayed = '#1db954', // Teal/Primary
    colorRemaining = 'rgba(255, 255, 255, 0.2)' 
}: WaveformProps) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [hoverX, setHoverX] = useState<number | null>(null);
    const [isDragging, setIsDragging] = useState(false);

    // Parse data safely
    const waveformData = typeof data === 'string' ? JSON.parse(data) : data;

    const draw = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Handle high DPI
        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        
        // Only set dims if they change to avoid flickering/clearing
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

        const barWidth = 3 * dpr;
        const gap = 1 * dpr;
        const totalBars = Math.floor(width / (barWidth + gap));
        
        // Resample logic
        const step = waveformData.length / totalBars;
        
        for (let i = 0; i < totalBars; i++) {
            const dataIndex = Math.floor(i * step);
            const value = waveformData[dataIndex] || 0;
            
            const barHeight = Math.max(2 * dpr, value * heightPX * 0.8);
            const x = i * (barWidth + gap);
            const y = (heightPX - barHeight) / 2;

            // Determine color
            const barPercent = i / totalBars;
            let fillStyle = colorRemaining;
            
            if (barPercent < progress) {
                fillStyle = colorPlayed;
            }
            
            // Hover effect
            if (hoverX !== null) {
                const hoverPercent = hoverX / rect.width;
                if (barPercent < hoverPercent && barPercent >= progress) {
                     fillStyle = 'rgba(255, 255, 255, 0.4)';
                }
            }

            ctx.fillStyle = fillStyle;
            
            // Rounded rect manually
            const radius = 2 * dpr;
            ctx.beginPath();
            ctx.roundRect(x, y, barWidth, barHeight, radius);
            ctx.fill();
        }
    };

    useEffect(() => {
        draw();
    }, [waveformData, progress, hoverX, colorPlayed, colorRemaining]);

    // Handle seeking with better coordinate calculation
    const calculateSeekPercent = (clientX: number): number => {
        const canvas = canvasRef.current;
        if (!canvas) return 0;
        
        const rect = canvas.getBoundingClientRect();
        const x = clientX - rect.left;
        const percent = x / rect.width;
        return Math.min(1, Math.max(0, percent));
    };

    const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
        setIsDragging(true);
        const percent = calculateSeekPercent(e.clientX);
        onSeek(percent);
    };

    const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left;
        setHoverX(x);

        // If dragging, continuously seek
        if (isDragging) {
            const percent = calculateSeekPercent(e.clientX);
            onSeek(percent);
        }
    };

    const handleMouseUp = () => {
        setIsDragging(false);
    };

    const handleMouseLeave = () => {
        setHoverX(null);
        setIsDragging(false);
    };

    // Handle global mouse events to fix seeking when mouse leaves canvas during drag
    useEffect(() => {
        if (!isDragging) return;
        
        const handleGlobalMouseMove = (e: MouseEvent) => {
            const percent = calculateSeekPercent(e.clientX);
            onSeek(percent);
        };
        
        const handleGlobalMouseUp = () => {
            setIsDragging(false);
        };

        window.addEventListener('mousemove', handleGlobalMouseMove);
        window.addEventListener('mouseup', handleGlobalMouseUp);
        
        return () => {
            window.removeEventListener('mousemove', handleGlobalMouseMove);
            window.removeEventListener('mouseup', handleGlobalMouseUp);
        };
    }, [isDragging, onSeek]);

    if (!waveformData) return null;

    return (
        <canvas 
            ref={canvasRef}
            className="w-full h-full cursor-pointer opacity-80 hover:opacity-100 transition-opacity select-none"
            style={{ height: `${height}px`, display: 'block' }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseLeave}
        />
    );
};
