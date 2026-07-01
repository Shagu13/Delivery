// Attention helpers for the courier "new order" heads-up: a short WebAudio chime and a
// phone vibration. No audio asset needed — the chime is synthesised. Browsers require a
// user gesture before audio can play, so `primeAudio()` is called on the courier's first
// tap to unlock/resume the AudioContext; after that `playChime()` works from a SignalR ping.

let audioCtx: AudioContext | null = null;

type AudioCtor = typeof AudioContext;
function getCtor(): AudioCtor | null {
    const w = window as unknown as { AudioContext?: AudioCtor; webkitAudioContext?: AudioCtor };
    return w.AudioContext ?? w.webkitAudioContext ?? null;
}

/** Unlock/resume the audio context from a user gesture so later chimes can play. */
export function primeAudio(): void {
    try {
        const Ctor = getCtor();
        if (!Ctor) return;
        audioCtx = audioCtx ?? new Ctor();
        if (audioCtx.state === 'suspended') void audioCtx.resume();
    } catch { /* audio unavailable — ignore */ }
}

/** Play a short two-note chime. Silently no-ops if audio is blocked/unavailable. */
export function playChime(): void {
    try {
        const Ctor = getCtor();
        if (!Ctor) return;
        const ctx = audioCtx ?? new Ctor();
        audioCtx = ctx;
        if (ctx.state === 'suspended') void ctx.resume();

        const now = ctx.currentTime;
        [880, 1175].forEach((freq, i) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.value = freq;
            const t0 = now + i * 0.18;
            gain.gain.setValueAtTime(0.0001, t0);
            gain.gain.exponentialRampToValueAtTime(0.35, t0 + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.17);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(t0);
            osc.stop(t0 + 0.19);
        });
    } catch { /* ignore */ }
}

/** Vibrate the phone (a short triple buzz) where supported. */
export function vibrate(): void {
    try { navigator.vibrate?.([300, 120, 300]); } catch { /* ignore */ }
}
