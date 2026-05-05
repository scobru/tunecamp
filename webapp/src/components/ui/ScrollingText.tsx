import { useEffect, useRef, useState } from 'react';

export const ScrollingText = ({ children, className = '' }: { children: React.ReactNode, className?: string }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLSpanElement>(null);
    const [shouldScroll, setShouldScroll] = useState(false);

    const [prefersReducedMotion, setPrefersReducedMotion] = useState(() => {
        if (typeof window !== 'undefined') {
            return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        }
        return false;
    });

    useEffect(() => {
        if (typeof window === 'undefined') return;

        const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
        const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
        mediaQuery.addEventListener('change', handler);
        return () => mediaQuery.removeEventListener('change', handler);
    }, []);

    useEffect(() => {
        const check = () => {
            if (!containerRef.current || !contentRef.current) return;
            // Add a small buffer to avoid flickering or scrolling for 1px diff
            const containerWidth = containerRef.current.offsetWidth;
            const contentWidth = contentRef.current.offsetWidth;
            setShouldScroll(contentWidth > containerWidth);
        };

        // Check immediately and after a short delay to ensure fonts loaded/layout settled
        check();
        const timer = setTimeout(check, 100);
        
        window.addEventListener('resize', check);
        return () => {
            window.removeEventListener('resize', check);
            clearTimeout(timer);
        };
    }, [children]);

    const titleText = typeof children === 'string' ? children : undefined;

    return (
        <div
            ref={containerRef}
            className={`overflow-hidden relative group ${className}`}
            title={titleText}
        >
             {/* Measurement element - invisible but determines if we need to scroll */}
             <span ref={contentRef} className="absolute opacity-0 whitespace-nowrap pointer-events-none invisible">
                 {children}
             </span>

             {shouldScroll && !prefersReducedMotion ? (
                 <div className="animate-marquee whitespace-nowrap flex">
                     <span className="pr-8">{children}</span>
                     <span className="pr-8" aria-hidden="true">{children}</span>
                 </div>
             ) : (
                 <div className="truncate">{children}</div>
             )}
        </div>
    );
};

