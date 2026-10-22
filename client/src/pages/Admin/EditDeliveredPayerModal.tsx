import { useEffect, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { FormField } from '../../components/ui/FormField';
import { changeOrderPayer, fetchPayerChangePreview } from '../../api/orders';
import type { ServicePayer } from '../../api/adminGroupOrders';
import { useLanguage } from '../../contexts/useLanguage';
import { PayerChangePreviewPanel } from './PayerChangePreviewPanel';
import '../../components/ui/Modal.css';
import './EditDeliveredPayerModal.css';

export interface PayerEditTarget {
  id: string;
  trackingNumber: string;
  payer: ServicePayer;
}

interface Props {
  target: PayerEditTarget;
  token: string;
  onClose: () => void;
  onSaved: () => void;
}

const DEBOUNCE_MS = 350;

/**
 * History → Edit on a delivered order: flip who pays the courier service fee (Sender ⇄ Recipient).
 * The fee starts at what the customer's pricing resolves to (special price → negotiated rate → district
 * default); the admin can override it, or must enter it when nothing resolves. Every consequence is
 * computed by the server and shown before anything is saved. Mount it keyed by order id so state resets.
 */
export function EditDeliveredPayerModal({ target, token, onClose, onSaved }: Props) {
  const { t } = useLanguage();
  const newPayer: ServicePayer = target.payer === 'Sender' ? 'Recipient' : 'Sender';

  // The input shows the server's suggestion until the admin types; only a typed fee is sent to the preview.
  const [typedFee, setTypedFee] = useState<string | null>(null);
  const [debouncedFee, setDebouncedFee] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    const id = setTimeout(() => setDebouncedFee(typedFee), DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [typedFee]);

  const parsedFee = debouncedFee === null || debouncedFee.trim() === '' ? undefined : Number(debouncedFee);
  const feeInvalid = parsedFee !== undefined && (!Number.isFinite(parsedFee) || parsedFee < 0);
  const feePending = typedFee !== debouncedFee;
  // An emptied box means "no fee yet" — never fall back to a suggestion the admin can no longer see.
  const feeEmpty = typedFee !== null && typedFee.trim() === '';

  const preview = useQuery({
    queryKey: ['admin', 'payerChangePreview', target.id, newPayer, parsedFee ?? null] as const,
    queryFn: () => fetchPayerChangePreview(token, target.id, newPayer, parsedFee),
    enabled: !feeInvalid,
    placeholderData: keepPreviousData,
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });
  const data = preview.data;

  const feeText = typedFee ?? (data?.suggestedFee != null ? String(data.suggestedFee) : '');
  const canApply = !saving && !feePending && !feeInvalid && !feeEmpty && !preview.isFetching
    && !preview.isError && data?.appliedFee != null;

  async function handleApply() {
    if (data?.appliedFee == null) return;
    setSaving(true);
    setSaveError(null);
    try {
      await changeOrderPayer(token, target.id, newPayer, data.appliedFee);
      onSaved();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : t.pcmSaveFail);
      setSaving(false);
    }
  }

  const payerLabel = (p: ServicePayer) => (p === 'Sender' ? t.pcmSender : t.pcmRecipient);
  const sourceText = data ? (t.pcmFeeSource as Record<string, string>)[data.suggestedFeeSource] : null;

  return (
    <div className="ui-modal-overlay" onClick={saving ? undefined : onClose}>
      <div className="ui-modal pcm-modal" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="ui-modal__header">
          <span className="ui-modal__title">{t.pcmTitle(target.trackingNumber)}</span>
          <button className="ui-modal__close" onClick={onClose} disabled={saving} aria-label={t.close}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="ui-modal__body">
          <p className="ui-modal__message">{t.pcmIntro}</p>

          <div className="pcm-swap">
            <div><span className="pcm-swap__label">{t.pcmCurrentPayer}</span><b>{payerLabel(target.payer)}</b></div>
            <span className="pcm-swap__arrow" aria-hidden="true">→</span>
            <div><span className="pcm-swap__label">{t.pcmNewPayer}</span><b>{payerLabel(newPayer)}</b></div>
          </div>

          <FormField label={t.pcmFeeLabel} type="number" min={0} step="0.01" inputMode="decimal"
            value={feeText} onChange={e => setTypedFee(e.target.value)}
            error={feeInvalid ? t.pcmFeeEnter : undefined} />
          {sourceText && (
            <p className="pcm-source">
              {data?.suggestedFee != null ? `₾${data.suggestedFee.toFixed(2)} · ` : ''}{sourceText}
            </p>
          )}

          {preview.isError && <div className="ui-modal__error" role="alert">{t.pcmPreviewFail} {preview.error.message}</div>}
          {!preview.isError && (feeEmpty || (data?.appliedFee == null && !preview.isPending)) && (
            <p className="pcm-source">{t.pcmFeeEnter}</p>
          )}
          {preview.isPending && <p className="pcm-source">{t.pcmPreviewLoading}</p>}
          {!feeEmpty && data?.appliedFee != null && (
            <div className={preview.isFetching || feePending ? 'pcm-stale' : undefined}>
              <PayerChangePreviewPanel preview={data} />
            </div>
          )}

          {saveError && <div className="ui-modal__error" role="alert">{saveError}</div>}
        </div>

        <div className="ui-modal__footer">
          <button className="ui-modal__btn ui-modal__btn--ghost" onClick={onClose} disabled={saving}>{t.cancel}</button>
          <button className="ui-modal__btn ui-modal__btn--primary" onClick={() => void handleApply()} disabled={!canApply}>
            {saving ? t.pcmApplying : t.pcmApply}
          </button>
        </div>
      </div>
    </div>
  );
}
