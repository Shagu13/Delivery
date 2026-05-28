import { useEffect, useState, useRef } from 'react';

export type SwipeVariant = 'primary' | 'success';

interface SwipeButtonProps {
    label: string;
    onSwipe: () => void;
    disabled?: boolean;
    variant?: SwipeVariant;
}

export function SwipeButton({ label, onSwipe, disabled = false, variant = 'primary' }: SwipeButtonProps) {
    const trackRef = useRef<HTMLDivElement>(null);
    const [offset, setOffset] = useState(0);
    const [swipeState, setSwipeState] = useState<'idle' | 'confirmed'>('idle');
    const startXRef = useRef<number | null>(null);
    const [maxTravel, setMaxTravel] = useState(200);
    const HANDLE_SIZE = 48; const PADDING = 4; const THRESHOLD = 0.82;

    useEffect(() => {
        const el = trackRef.current; if (!el) return;
        const ro = new ResizeObserver(([e]) => setMaxTravel(e.contentRect.width - HANDLE_SIZE - PADDING * 2));
        ro.observe(el); return () => ro.disconnect();
    }, []);

    const handlePointerDown = (e: React.PointerEvent) => {
        if (disabled || swipeState === 'confirmed') return;
        startXRef.current = e.clientX;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    };
    const handlePointerMove = (e: React.PointerEvent) => {
        if (startXRef.current === null || swipeState === 'confirmed') return;
        const dx = Math.max(0, Math.min(e.clientX - startXRef.current, maxTravel));
        setOffset(dx);
        if (dx / maxTravel >= THRESHOLD) {
            startXRef.current = null; setOffset(maxTravel); setSwipeState('confirmed');
            setTimeout(() => { onSwipe(); setTimeout(() => { setSwipeState('idle'); setOffset(0); }, 500); }, 280);
        }
    };
    const handlePointerUp = () => { if (swipeState === 'confirmed') return; startXRef.current = null; setOffset(0); };

    const progress = maxTravel > 0 ? offset / maxTravel : 0;
    const isSnappingBack = swipeState === 'idle' && offset === 0;
    const palette: Record<SwipeVariant, { bg: string; fill: string; handle: string; labelColor: string }> = {
        primary: { bg: 'var(--color-accent-dim)', fill: 'var(--color-accent)', handle: 'var(--color-accent)', labelColor: 'var(--color-accent)' },
        success: { bg: '#d1fae5', fill: '#10b981', handle: '#059669', labelColor: '#065f46' },
    };
    const c = palette[variant];

    return (
        <div ref={trackRef} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp} onPointerCancel={handlePointerUp}
            style={{ position: 'relative', height: '56px', borderRadius: '100px',
                background: disabled ? 'var(--color-bg-3)' : c.bg, overflow: 'hidden', userSelect: 'none',
                cursor: disabled ? 'not-allowed' : 'ew-resize', opacity: disabled ? 0.55 : 1,
                touchAction: 'none', WebkitTapHighlightColor: 'transparent' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0,
                width: `${PADDING + HANDLE_SIZE + offset}px`,
                background: swipeState === 'confirmed' ? c.fill : `${c.fill}4d`, borderRadius: '100px',
                transition: isSnappingBack ? 'width 0.4s cubic-bezier(0.34,1.56,0.64,1)' : 'none', pointerEvents: 'none' }} />
            {swipeState === 'idle' && (
                <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
                    justifyContent: 'center', paddingLeft: `${HANDLE_SIZE + PADDING * 2 + 8}px`,
                    fontSize: '0.875rem', fontWeight: 700, color: c.labelColor, letterSpacing: '0.02em',
                    pointerEvents: 'none', opacity: Math.max(0, 1 - progress * 2.5),
                    transition: isSnappingBack ? 'opacity 0.3s' : 'none' }}>{label}</span>
            )}
            {swipeState === 'confirmed' && (
                <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
                    justifyContent: 'center', fontSize: '1.25rem', color: '#fff', fontWeight: 700, pointerEvents: 'none' }}>✓</span>
            )}
            <div style={{ position: 'absolute', top: PADDING, left: PADDING,
                width: `${HANDLE_SIZE}px`, height: `${HANDLE_SIZE}px`, borderRadius: '100px',
                background: disabled ? 'var(--color-border)' : c.handle,
                transform: `translateX(${offset}px)`,
                transition: isSnappingBack ? 'transform 0.4s cubic-bezier(0.34,1.56,0.64,1)' : 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: swipeState === 'confirmed' ? '0 2px 12px rgba(0,0,0,0.22)' : '0 2px 8px rgba(0,0,0,0.15)',
                pointerEvents: 'none', fontSize: swipeState === 'confirmed' ? '1rem' : '1.5rem', color: '#fff', lineHeight: 1 }}>
                {swipeState === 'confirmed' ? '✓' : '›'}
            </div>
            {swipeState === 'idle' && offset === 0 && (
                <div style={{ position: 'absolute', top: '50%', left: `${PADDING + HANDLE_SIZE + 8}px`,
                    transform: 'translateY(-50%)', display: 'flex', gap: '3px', opacity: 0.35, pointerEvents: 'none' }}>
                    {['›','›','›'].map((ch, i) => <span key={i} style={{ fontSize: '0.7rem', color: c.labelColor }}>{ch}</span>)}
                </div>
            )}
        </div>
    );
}
