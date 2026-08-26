import { sanitizeGeorgianMobile } from './GeorgianPhoneField';
import { useLanguage } from '../../contexts/useLanguage';
import { Highlight } from './Highlight';
import './PhoneActions.css';

/**
 * Renders a phone number as text plus a call button and a WhatsApp button. Stored numbers are
 * the bare 9-digit Georgian local number (see `sanitizeGeorgianMobile`) with no country code, so
 * both links prepend `995` — WhatsApp in particular needs the full international number to
 * resolve a chat, and a bare local number would silently fail to open one.
 */
export function PhoneActions({ phone, className, highlightTerm }: { phone: string; className?: string; highlightTerm?: string }) {
  const { t } = useLanguage();
  const local = sanitizeGeorgianMobile(phone);
  const intl = local ? `995${local}` : null;

  return (
    <span className={`phone-actions ${className ?? ''}`}>
      <span className="phone-actions__num">
        {highlightTerm ? <Highlight text={phone} term={highlightTerm} /> : phone}
      </span>
      {intl && (
        <span className="phone-actions__btns" onClick={e => e.stopPropagation()}>
          <a
            className="phone-actions__btn phone-actions__btn--call"
            href={`tel:+${intl}`}
            title={t.phoneActionsCall}
            aria-label={t.phoneActionsCall}
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
              <path
                d="M3.5 2h2l1 3-1.5 1.2a8 8 0 0 0 4.8 4.8L11 9.5l3 1v2c0 .8-.7 1.5-1.5 1.5C6.5 14 2 9.5 2 3.5 2 2.7 2.7 2 3.5 2Z"
                stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" strokeLinecap="round"
              />
            </svg>
          </a>
          <a
            className="phone-actions__btn phone-actions__btn--wa"
            href={`https://wa.me/${intl}`}
            target="_blank"
            rel="noreferrer"
            title={t.phoneActionsWhatsapp}
            aria-label={t.phoneActionsWhatsapp}
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
              <path
                d="M8 2a6 6 0 0 0-5.1 9.1L2 14l3-.9A6 6 0 1 0 8 2Z"
                stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"
              />
              <path
                d="M5.8 5.6c.15-.35.3-.35.45-.35h.35c.12 0 .28 0 .4.3.15.35.5 1.2.55 1.3.05.1.08.2 0 .32-.07.13-.1.2-.2.3-.1.12-.2.25-.3.33-.1.1-.2.2-.1.4.35.6.75 1.05 1.25 1.4.5.35.85.5 1.05.4.15-.1.25-.2.35-.3.1-.13.2-.13.35-.08.15.05 1 .47 1.15.55.15.08.25.12.3.2.05.08.05.45-.1.9-.15.4-.85.8-1.2.85-.3.05-.7.07-1.1-.07a6.7 6.7 0 0 1-2.9-2.05 6.4 6.4 0 0 1-1.25-2.4c-.1-.4-.1-.75.05-1Z"
                fill="currentColor"
              />
            </svg>
          </a>
        </span>
      )}
    </span>
  );
}
