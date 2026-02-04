import { useEffect, useRef, useState } from 'react';

export const ScrollingText = ({ children, className = '' }: { children: React.ReactNode, className?: string }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLSpanElement>(null);
    const [shouldScroll, setShouldScroll] = useState(false);

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

    return (
        <div ref={containerRef} className={`overflow-hidden relative group ${className}`}>
             {/* Measurement element - invisible but determines if we need to scroll */}
             <span ref={contentRef} className="absolute opacity-0 whitespace-nowrap pointer-events-none invisible">
                 {children}
             </span>

             {shouldScroll ? (
                 <div className="animate-marquee whitespace-nowrap flex">
                     <span className="pr-8">{children}</span>
                     <span className="pr-8">{children}</span>
                 </div>
             ) : (
                 <div className="truncate">{children}</div>
             )}
        </div>
    );
};
