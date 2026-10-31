import { useEffect, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { useLanguage } from '../../contexts/useLanguage';

/**
 * Makes every open modal dialog horizontally resizable by its left/right border — mounted ONCE (in AppLayout),
 * so no individual modal needs wiring. It finds `[role="dialog"][aria-modal="true"]` elements, and for each one
 * that is a centred, not-full-screen box on a desktop-width viewport it renders two invisible grab strips on its
 * borders. Dragging sets an inline width on the dialog (the modal stays centred, so the edge follows the cursor);
 * double-clicking a strip restores the dialog's own width. Everything inside simply reflows.
 *
 * Opt-outs / options, as attributes on the dialog element:
 *   data-no-resize          never resizable
 *   data-resize-min="640"   minimum width in px (default 320)
 *   data-resize-key="k"     remember the chosen width per browser in localStorage under `k`
 */

const DIALOG_SELECTOR  = '[role="dialog"][aria-modal="true"]:not([data-no-resize])';
const GRIP_W           = 10;    // hit area of each strip
const VIEWPORT_MARGIN  = 32;    // a dialog never grows past the viewport minus this
const DEFAULT_MIN      = 320;
const MIN_VIEWPORT     = 720;   // below this the dialog is effectively full-width already

// ── DOM helpers (module level: they mutate the dialog element, which React doesn't own) ──────────────
const originalStyles = new WeakMap<HTMLElement, { width: string; maxWidth: string }>();
const elementIds     = new WeakMap<HTMLElement, number>();
let nextElementId = 1;

function elementKey(el: HTMLElement): number {
    let id = elementIds.get(el);
    if (id === undefined) { id = nextElementId++; elementIds.set(el, id); }
    return id;
}

function setDialogWidth(el: HTMLElement, width: number | null) {
    if (!originalStyles.has(el)) originalStyles.set(el, { width: el.style.width, maxWidth: el.style.maxWidth });
    const original = originalStyles.get(el)!;
    if (width == null) {
        el.style.width    = original.width;
        el.style.maxWidth = original.maxWidth;
    } else {
        el.style.width    = `${width}px`;
        el.style.maxWidth = `${window.innerWidth - VIEWPORT_MARGIN}px`;
    }
}

function readStoredWidth(key: string | undefined): number | null {
    if (!key) return null;
    try {
        const v = Number(localStorage.getItem(key));
        return Number.isFinite(v) && v > 0 ? v : null;
    } catch { return null; }
}

function storeWidth(key: string | undefined, width: number | null) {
    if (!key) return;
    try {
        if (width == null) localStorage.removeItem(key);
        else localStorage.setItem(key, String(Math.round(width)));
    } catch { /* storage unavailable — the width just isn't remembered */ }
}

/** Highest z-index on the dialog or any ancestor: a dialog inside a z-indexed overlay lives in that overlay's stacking context. */
function stackLevel(el: HTMLElement): number {
    let level = 0;
    for (let p: HTMLElement | null = el; p; p = p.parentElement) {
        const z = parseInt(getComputedStyle(p).zIndex, 10);
        if (!Number.isNaN(z)) level = Math.max(level, z);
    }
    return level + 1;
}

interface Box { left: number; top: number; w: number; h: number; vw: number; vh: number; z: number }

function measure(el: HTMLElement): Box {
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, w: r.width, h: r.height, vw: window.innerWidth, vh: window.innerHeight, z: stackLevel(el) };
}

// ── Component ──────────────────────────────────────────────────────────────────────────────────────────
export function AutoResizeDialogs() {
    const [dialogs, setDialogs] = useState<HTMLElement[]>([]);

    useEffect(() => {
        let frame = 0;
        const scan = () => {
            frame = 0;
            const found = Array.from(document.querySelectorAll<HTMLElement>(DIALOG_SELECTOR));
            setDialogs(prev => prev.length === found.length && prev.every((el, i) => el === found[i]) ? prev : found);
        };
        const schedule = () => { if (!frame) frame = requestAnimationFrame(scan); };
        scan();
        const observer = new MutationObserver(schedule);
        observer.observe(document.body, { childList: true, subtree: true });
        return () => { observer.disconnect(); if (frame) cancelAnimationFrame(frame); };
    }, []);

    return <>{dialogs.map(el => <DialogResizer key={elementKey(el)} el={el} />)}</>;
}

function DialogResizer({ el }: { el: HTMLElement }) {
    const { t } = useLanguage();
    const [box, setBox] = useState<Box | null>(null);

    useEffect(() => {
        const stored = readStoredWidth(el.dataset.resizeKey);
        if (stored) setDialogWidth(el, Math.min(stored, window.innerWidth - VIEWPORT_MARGIN));

        const update = () => setBox(measure(el));
        update();
        // Dialogs animate in with a short translate; measure again once it has settled.
        const settled = window.setTimeout(update, 400);
        const observer = new ResizeObserver(update);
        observer.observe(el);
        window.addEventListener('resize', update);
        return () => {
            window.clearTimeout(settled);
            observer.disconnect();
            window.removeEventListener('resize', update);
        };
    }, [el]);

    if (!box) return null;
    const centred        = Math.abs(box.left + box.w / 2 - box.vw / 2) < 12;
    const coversViewport = box.w >= box.vw - 2 && box.h >= box.vh - 2;   // an overlay wrapper, not the dialog box
    if (box.vw < MIN_VIEWPORT || !centred || coversViewport) return null;

    const minWidth = Number(el.dataset.resizeMin) || DEFAULT_MIN;

    const reset = () => { setDialogWidth(el, null); storeWidth(el.dataset.resizeKey, null); };

    const startDrag = (side: 'left' | 'right') => (e: ReactPointerEvent<HTMLDivElement>) => {
        e.preventDefault();
        const handle = e.currentTarget;
        handle.setPointerCapture(e.pointerId);
        const startX = e.clientX;
        const startW = el.getBoundingClientRect().width;
        let last = startW;

        const move = (ev: PointerEvent) => {
            const dx = (ev.clientX - startX) * (side === 'right' ? 1 : -1);
            last = Math.round(Math.min(window.innerWidth - VIEWPORT_MARGIN, Math.max(minWidth, startW + dx * 2)));
            setDialogWidth(el, last);
        };
        const end = () => {
            handle.removeEventListener('pointermove', move);
            handle.removeEventListener('pointerup', end);
            handle.removeEventListener('pointercancel', end);
            storeWidth(el.dataset.resizeKey, last);
        };
        handle.addEventListener('pointermove', move);
        handle.addEventListener('pointerup', end);
        handle.addEventListener('pointercancel', end);
    };

    const common = {
        position: 'fixed' as const, top: box.top, height: box.h, width: GRIP_W, zIndex: box.z,
        cursor: 'ew-resize', touchAction: 'none' as const,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
    };
    const grip = <span aria-hidden style={{ width: 3, height: 44, borderRadius: 2, background: 'var(--color-border)', opacity: 0.8 }} />;

    return (
        <>
            <div role="separator" aria-orientation="vertical" aria-label={t.dlgResizeHint} title={t.dlgResizeHint}
                style={{ ...common, left: box.left - GRIP_W + 2 }}
                onPointerDown={startDrag('left')} onDoubleClick={reset}>{grip}</div>
            <div role="separator" aria-orientation="vertical" aria-label={t.dlgResizeHint} title={t.dlgResizeHint}
                style={{ ...common, left: box.left + box.w - 2 }}
                onPointerDown={startDrag('right')} onDoubleClick={reset}>{grip}</div>
        </>
    );
}
