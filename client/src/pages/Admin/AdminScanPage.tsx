import { useMemo, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { exportScanManifest, scanOrder } from '../../api/scan';
import type { ScannedOrder } from '../../api/scan';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { useLanguage } from '../../contexts/useLanguage';
import { useScanSession } from '../../hooks/useScanSession';
import { CameraScanner } from './CameraScanner';
import { ScanCourierGroup } from './ScanCourierGroup';
import './AdminScanPage.css';

interface Props {
  token: string;
}

interface Notice {
  kind: 'ok' | 'error';
  text: string;
}

// Barcode scanners type the code + Enter into whatever is focused, so this screen is one
// always-focused input. Each scan adds a package to a per-courier list; Excel is generated
// from that list on demand (a browser can't append to a file it already downloaded).
export default function AdminScanPage({ token }: Props) {
  const { t, lang } = useLanguage();
  const session = useScanSession();
  const inputRef = useRef<HTMLInputElement>(null);
  const [code, setCode] = useState('');
  const [notice, setNotice] = useState<Notice | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [downloadingKey, setDownloadingKey] = useState<string | null>(null);

  const scan = useMutation({
    mutationFn: (tracking: string) => scanOrder(token, tracking),
    onSuccess: (order: ScannedOrder) => {
      session.add(order);
      setNotice({ kind: 'ok', text: `${order.trackingNumber} → ${order.courierFullName ?? ''}` });
    },
    onError: (e: Error) => setNotice({ kind: 'error', text: e.message }),
    onSettled: () => inputRef.current?.focus(),
  });

  const download = useMutation({
    mutationFn: ({ courierId }: { key: string; courierId?: string }) =>
      exportScanManifest(token, session.items.map(i => i.trackingNumber), lang, courierId),
    onMutate: ({ key }) => setDownloadingKey(key),
    onError: (e: Error) => setNotice({ kind: 'error', text: e.message }),
    onSettled: () => setDownloadingKey(null),
  });

  const groups = useMemo(() => {
    const map = new Map<string, ScannedOrder[]>();
    for (const o of session.items) {
      const key = o.courierId ?? '';
      map.set(key, [...(map.get(key) ?? []), o]);
    }
    return [...map.entries()];
  }, [session.items]);

  // Shared by the typed/hardware-scanner input and the camera reader.
  const handleCode = (raw: string) => {
    const value = raw.trim().toUpperCase();
    if (!value) return;
    if (session.has(value)) {
      setNotice({ kind: 'error', text: `${value} — ${t.scanDuplicate}` });
      return;
    }
    scan.mutate(value);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const value = code;
    setCode('');
    handleCode(value);
  };

  return (
    <div className="scan-page">
      <form className="scan-form" onSubmit={submit}>
        <input
          ref={inputRef}
          className="scan-input"
          value={code}
          onChange={e => setCode(e.target.value)}
          placeholder={t.scanPlaceholder}
          autoFocus
          autoComplete="off"
          autoCapitalize="characters"
          disabled={scan.isPending}
        />
      </form>

      {/* Camera scanning (phone) — self-contained; delete this block, the import, the
          `cameraOn` state and CameraScanner.tsx/.css to remove the feature. */}
      {cameraOn
        ? <CameraScanner onDetect={handleCode} onClose={() => setCameraOn(false)} />
        : <button type="button" className="scan-btn" onClick={() => setCameraOn(true)}>{t.scanCamera}</button>}

      {notice && <div className={`scan-notice scan-notice--${notice.kind}`} role="status">{notice.text}</div>}

      {groups.length === 0 ? (
        <p className="scan-empty">{t.scanEmpty}</p>
      ) : (
        <>
          <div className="scan-toolbar">
            <span className="scan-toolbar__total">{t.scanTotal}: {session.items.length}</span>
            <button type="button" className="scan-btn scan-btn--primary" disabled={downloadingKey !== null}
              onClick={() => download.mutate({ key: 'all' })}>
              {downloadingKey === 'all' ? t.scanDownloading : t.scanDownloadAll}
            </button>
            <button type="button" className="scan-btn" onClick={() => setConfirmClear(true)}>{t.scanClear}</button>
          </div>
          {groups.map(([courierId, orders]) => (
            <ScanCourierGroup
              key={courierId}
              courierName={orders[0].courierFullName ?? '—'}
              orders={orders}
              downloading={downloadingKey === courierId}
              onDownload={() => download.mutate({ key: courierId, courierId })}
              onRemove={session.remove}
            />
          ))}
        </>
      )}

      <ConfirmDialog
        open={confirmClear}
        title={t.scanClear}
        message={t.scanClearConfirm}
        variant="danger"
        onConfirm={() => { session.clear(); setConfirmClear(false); setNotice(null); inputRef.current?.focus(); }}
        onCancel={() => setConfirmClear(false)}
      />
    </div>
  );
}
