import { useLanguage } from '../../contexts/useLanguage';
import { getPasswordRules } from '../../utils/passwordRules';
import './PasswordRequirements.css';

interface Props {
  /** Current password value; each rule turns green once satisfied. */
  value: string;
}

/**
 * Live checklist of password requirements. Each rule shows a ✓ when met and a ○
 * when not, so users get clear, friendly guidance instead of a single opaque error.
 */
export function PasswordRequirements({ value }: Props) {
  const { t } = useLanguage();
  const rules = getPasswordRules(t);

  return (
    <ul className="pwd-reqs" aria-label={t.pwdRequirementsTitle}>
      {rules.map(rule => {
        const met = rule.test(value);
        return (
          <li
            key={rule.key}
            className={`pwd-reqs__item ${met ? 'pwd-reqs__item--met' : ''}`}
          >
            <span className="pwd-reqs__icon" aria-hidden="true">
              {met ? (
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                  <path d="M3.5 8.5l3 3 6-6.5" stroke="currentColor" strokeWidth="1.8"
                    strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : (
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                  <circle cx="8" cy="8" r="3" fill="currentColor" />
                </svg>
              )}
            </span>
            {rule.label}
          </li>
        );
      })}
    </ul>
  );
}
