import type { PayerChangePreview, PayerChangeLine } from '../../api/orders';
import { useLanguage } from '../../contexts/useLanguage';
import './EditDeliveredPayerModal.css';

const MONEY = /^-?\d+\.\d{2}$/;

/** Invariant backend text → display text: money gets a ₾, enum/boolean names are translated. */
function useFormatValue() {
  const { t } = useLanguage();
  const values = t.pcmValues as Record<string, string>;
  return (v: string | null): string => {
    if (v === null) return '—';
    if (MONEY.test(v)) return `₾${v}`;
    return values[v] ?? v;
  };
}

function Line({ line }: { line: PayerChangeLine }) {
  const { t } = useLanguage();
  const format = useFormatValue();
  const label = (t.pcmFields as Record<string, string>)[line.field] ?? line.field;
  return (
    <li className="pcm-line">
      <span className="pcm-line__field">{label}</span>
      <span className="pcm-line__values">
        <span className="pcm-line__before">{format(line.before)}</span>
        <span aria-hidden="true"> → </span>
        <span className="pcm-line__after">{format(line.after)}</span>
      </span>
    </li>
  );
}

/** Everything the payer change would touch, as the server computed it — fields first, then consequences to confirm. */
export function PayerChangePreviewPanel({ preview }: { preview: PayerChangePreview }) {
  const { t } = useLanguage();
  const warnings = t.pcmWarnings as Record<string, (amount: string) => string>;

  return (
    <div className="pcm-preview">
      <p className="ui-modal__section-label">{t.pcmWillChange}</p>
      {preview.lines.length === 0
        ? <p className="ui-modal__message">{t.pcmNoChange}</p>
        : <ul className="pcm-lines">{preview.lines.map(l => <Line key={l.field} line={l} />)}</ul>}

      {preview.warnings.length > 0 && (
        <ul className="pcm-warnings" role="alert">
          {preview.warnings.map(w => (
            <li key={w.code}>{warnings[w.code]?.(w.amount.toFixed(2)) ?? w.code}</li>
          ))}
        </ul>
      )}

      <p className="pcm-note">{t.pcmReceiptsNote}</p>
    </div>
  );
}
