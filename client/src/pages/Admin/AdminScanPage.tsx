import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { exportScanManifest, scanOrder, scanUnassignedOrder } from '../../api/scan';
import type { ScannedOrder } from '../../api/scan';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { useLanguage } from '../../contexts/useLanguage';
import { ASSIGN_SESSION_KEY, useScanSession } from '../../hooks/useScanSession';
import { CameraScanner } from './CameraScanner';
import { ScanAssignPanel } from './ScanAssignPanel';
import { ScanCourierGroup } from './ScanCourierGroup';
import './AdminScanPage.css';

interface Props {
  token: string;
}

interface Notice {
  kind: 'ok' | 'error';
  text: string;
}

type ScanMode = 'manifest' | 'assign';

// Barcode scanners type the code + Enter into whatever is focused, so this screen is one
// always-focused input. Each scan adds a package to a per-courier list; Excel is generated
// from that list on demand (a browser can't append to a file it already downloaded).
export default function AdminScanPage({ token }: Props) {
  const { t, lang } = useLanguage();
  const session = useScanSession();
  const assignSession = useScanSession(ASSIGN_SESSION_KEY);
  const inputRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<ScanMode>('manifest');
  const [code, setCode] = useState('');
  const [notice, setNotice] = useState<Notice | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [downloadingKey, setDownloadingKey] = useState<string | null>(null);

  // A hardware scanner is just a keyboard: it types into whatever is focused. After a click on a
  // button/tab the focus is elsewhere, so route the next printable keystroke back to the scan
  // input (focusing during keydown means that same character still lands in it). Skipped while
  // a dialog is open or another field (e.g. the courier select) is being used.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.key.length !== 1) return;
      const active = document.activeElement;
      if (active instanceof HTMLInputElement || active instanceof HTMLSelectElement
        || active instanceof HTMLTextAreaElement) return;
      if (document.querySelector('[aria-modal="true"]')) return;
      inputRef.current?.focus();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  const scan = useMutation({
    mutationFn: ({ tracking, scanMode }: { tracking: string; scanMode: ScanMode }) =>
      scanMode === 'assign' ? scanUnassignedOrder(token, tracking) : scanOrder(token, tracking),
    onSuccess: (order: ScannedOrder, { scanMode }) => {
      if (scanMode === 'assign') {
        assignSession.add(order);
        setNotice({ kind: 'ok', text: `${order.trackingNumber} · ${order.recipientCity}, ${order.recipientDistrict}` });
        return;
      }
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
    if ((mode === 'assign' ? assignSession : session).has(value)) {
      setNotice({ kind: 'error', text: `${value} — ${t.scanDuplicate}` });
      return;
    }
    scan.mutate({ tracking: value, scanMode: mode });
  };

  const switchMode = (next: ScanMode) => {
    setMode(next);
    setNotice(null);
    inputRef.current?.focus();
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const value = code;
    setCode('');
    handleCode(value);
  };

  return (
    <div className="scan-page">
      <div className="scan-tabs" role="tablist">
        {(['manifest', 'assign'] as const).map(m => (
          <button key={m} type="button" role="tab" aria-selected={mode === m}
            className={`scan-tab${mode === m ? ' scan-tab--active' : ''}`} onClick={() => switchMode(m)}>
            {m === 'manifest' ? t.scanModeManifest : t.scanModeAssign}
          </button>
        ))}
      </div>

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
        />
      </form>

      {/* Camera scanning (phone) — self-contained; delete this block, the import, the
          `cameraOn` state and CameraScanner.tsx/.css to remove the feature. */}
      {cameraOn
        ? <CameraScanner onDetect={handleCode} onClose={() => setCameraOn(false)} />
        : <button type="button" className="scan-btn" onClick={() => setCameraOn(true)}>{t.scanCamera}</button>}

      {notice && <div className={`scan-notice scan-notice--${notice.kind}`} role="status">{notice.text}</div>}

      {mode === 'assign' ? (
        <ScanAssignPanel
          token={token}
          session={assignSession}
          onAddToManifest={orders => orders.forEach(session.add)}
          onError={text => setNotice({ kind: 'error', text })}
        />
      ) : groups.length === 0 ? (
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
