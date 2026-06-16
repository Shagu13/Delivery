import { useLanguage } from '../../contexts/useLanguage';
import './Modal.css';

interface Props {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** 'danger' renders a red confirm button (e.g. destructive actions). */
  variant?: 'danger' | 'primary';
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Self-contained confirmation dialog — a reliable in-app replacement for window.confirm. */
export function ConfirmDialog({
  open, title, message, confirmLabel, cancelLabel,
  variant = 'primary', loading = false, onConfirm, onCancel,
}: Props) {
  const { t } = useLanguage();
  if (!open) return null;

  return (
    <div className="ui-modal-overlay" onClick={onCancel}>
      <div className="ui-modal" onClick={e => e.stopPropagation()} role="alertdialog" aria-modal="true">
        <div className="ui-modal__header">
          <span className="ui-modal__title">{title}</span>
          <button className="ui-modal__close" onClick={onCancel} aria-label={t.close}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="ui-modal__body">
          <p className="ui-modal__message">{message}</p>
        </div>

        <div className="ui-modal__footer">
          <button className="ui-modal__btn ui-modal__btn--ghost" onClick={onCancel} disabled={loading}>
            {cancelLabel ?? t.cancel}
          </button>
          <button
            className={`ui-modal__btn ui-modal__btn--${variant}`}
            onClick={onConfirm}
            disabled={loading}
          >
            {confirmLabel ?? t.confirm}
          </button>
        </div>
      </div>
    </div>
  );
}
