import { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import type { IScannerControls } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';
import { useLanguage } from '../../contexts/useLanguage';
import './CameraScanner.css';

interface Props {
  onDetect: (code: string) => void;
  onClose: () => void;
}

type CameraError = 'denied' | 'inUse' | 'none' | 'insecure' | 'generic';

// getUserMedia rejects with a DOMException whose `name` says why; map it to a cause the courier
// can act on (allow access / close the other app / use HTTPS).
function classifyCameraError(e: unknown): CameraError {
  switch ((e as { name?: string } | null)?.name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError': return 'denied';
    case 'NotReadableError':
    case 'TrackStartError':
    case 'AbortError': return 'inUse';
    case 'NotFoundError':
    case 'DevicesNotFoundError':
    case 'OverconstrainedError': return 'none';
    case 'SecurityError': return 'insecure';
    default: return 'generic';
  }
}

type Strings = ReturnType<typeof useLanguage>['t'];
const MESSAGES: Record<CameraError, (t: Strings) => string> = {
  denied: t => t.scanCameraDenied,
  inUse: t => t.scanCameraInUse,
  none: t => t.scanCameraNone,
  insecure: t => t.scanCameraInsecure,
  generic: t => t.scanCameraError,
};

// Phone-camera barcode reader (Code 128 only — the format printed on our labels). Fully
// self-contained (its own CSS): the Scan pages just pass each decoded string to their normal
// scan path. Used by the admin Scan page and the courier Scan / delivery-scan flows.
export function CameraScanner({ onDetect, onClose }: Props) {
  const { t } = useLanguage();
  const videoRef = useRef<HTMLVideoElement>(null);
  const onDetectRef = useRef(onDetect);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const [error, setError] = useState<CameraError | null>(null);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [torchOn, setTorchOn] = useState(false);

  useEffect(() => { onDetectRef.current = onDetect; });

  useEffect(() => {
    let controls: IScannerControls | undefined;
    let cancelled = false;
    // A code is ignored for a few seconds after it fires (the camera sees the same label on every
    // frame), but not forever: if the lookup failed (bad signal) the courier can simply hold the
    // parcel up again. The page itself rejects codes already in the list.
    const lastSeen = new Map<string, number>();
    const REPEAT_AFTER_MS = 3000;

    const hints = new Map<DecodeHintType, unknown>([
      [DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.CODE_128]],
      [DecodeHintType.TRY_HARDER, true],
    ]);
    const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 120 });

    // Browsers expose the camera API only on HTTPS (or localhost); say so instead of failing vaguely.
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setError(window.isSecureContext ? 'generic' : 'insecure');
      return;
    }

    reader
      .decodeFromConstraints({
        // Without these many phones hand back a 640x480 stream with fixed focus, which is too few
        // pixels per bar on a label held at arm's length. `ideal` so older phones still open.
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          // focusMode isn't in the DOM lib typings yet; browsers that lack it ignore it.
          advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet],
        },
      }, videoRef.current!, result => {
        if (!result) return;
        const code = result.getText();
        const now = Date.now();
        const last = lastSeen.get(code);
        if (last !== undefined && now - last < REPEAT_AFTER_MS) return;
        lastSeen.set(code, now);
        navigator.vibrate?.(60);
        onDetectRef.current(code);
      })
      .then(c => {
        if (cancelled) { c.stop(); return; }
        controls = c;
        const stream = videoRef.current?.srcObject;
        const track = stream instanceof MediaStream ? stream.getVideoTracks()[0] : undefined;
        trackRef.current = track ?? null;
        // `torch` isn't in the DOM lib typings; only some Android browsers expose it.
        const caps = track?.getCapabilities?.() as { torch?: boolean } | undefined;
        setTorchAvailable(!!caps?.torch);
      })
      .catch((e: unknown) => setError(classifyCameraError(e)));

    return () => { cancelled = true; controls?.stop(); trackRef.current = null; };
  }, []);

  const toggleTorch = () => {
    const next = !torchOn;
    trackRef.current?.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] })
      .then(() => setTorchOn(next))
      .catch(() => setTorchAvailable(false));
  };

  return (
    <div className="cam">
      {error
        ? <p className="cam__error">{MESSAGES[error](t)}</p>
        : (
          <>
            <div className="cam__stage">
              <video ref={videoRef} className="cam__video" muted playsInline />
              <div className="cam__aim" aria-hidden="true" />
            </div>
            <p className="cam__hint">{t.scanCameraHint}</p>
            {torchAvailable && (
              <button type="button" className="cam__close" onClick={toggleTorch} aria-pressed={torchOn}>
                {t.scanCameraTorch}
              </button>
            )}
          </>
        )}
      <button type="button" className="cam__close" onClick={onClose}>{t.scanCameraClose}</button>
    </div>
  );
}
