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
  const [error, setError] = useState<CameraError | null>(null);

  useEffect(() => { onDetectRef.current = onDetect; });

  useEffect(() => {
    let controls: IScannerControls | undefined;
    let cancelled = false;
    const seen = new Set<string>(); // each code fires once per camera session

    const hints = new Map<DecodeHintType, unknown>([[DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.CODE_128]]]);
    const reader = new BrowserMultiFormatReader(hints);

    // Browsers expose the camera API only on HTTPS (or localhost); say so instead of failing vaguely.
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setError(window.isSecureContext ? 'generic' : 'insecure');
      return;
    }

    reader
      .decodeFromConstraints({ video: { facingMode: { ideal: 'environment' } } }, videoRef.current!, result => {
        if (!result) return;
        const code = result.getText();
        if (seen.has(code)) return;
        seen.add(code);
        navigator.vibrate?.(60);
        onDetectRef.current(code);
      })
      .then(c => { if (cancelled) c.stop(); else controls = c; })
      .catch((e: unknown) => setError(classifyCameraError(e)));

    return () => { cancelled = true; controls?.stop(); };
  }, []);

  return (
    <div className="cam">
      {error
        ? <p className="cam__error">{MESSAGES[error](t)}</p>
        : <video ref={videoRef} className="cam__video" muted playsInline />}
      <button type="button" className="cam__close" onClick={onClose}>{t.scanCameraClose}</button>
    </div>
  );
}
