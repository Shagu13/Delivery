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

// Phone-camera barcode reader (Code 128 only — the format printed on our labels). Fully
// self-contained: the Scan page just passes each decoded string to its normal scan path, so
// removing this file + its CSS and the button in AdminScanPage removes the feature.
export function CameraScanner({ onDetect, onClose }: Props) {
  const { t } = useLanguage();
  const videoRef = useRef<HTMLVideoElement>(null);
  const onDetectRef = useRef(onDetect);
  const [error, setError] = useState(false);

  useEffect(() => { onDetectRef.current = onDetect; });

  useEffect(() => {
    let controls: IScannerControls | undefined;
    let cancelled = false;
    const seen = new Set<string>(); // each code fires once per camera session

    const hints = new Map<DecodeHintType, unknown>([[DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.CODE_128]]]);
    const reader = new BrowserMultiFormatReader(hints);

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
      .catch(() => setError(true));

    return () => { cancelled = true; controls?.stop(); };
  }, []);

  return (
    <div className="cam">
      {error
        ? <p className="cam__error">{t.scanCameraError}</p>
        : <video ref={videoRef} className="cam__video" muted playsInline />}
      <button type="button" className="scan-btn" onClick={onClose}>{t.scanCameraClose}</button>
    </div>
  );
}
