import type { Translations } from '../contexts/translations';

/**
 * Single source of truth for client-side password complexity, kept in lock-step
 * with the backend (ASP.NET Identity PasswordOptions + PasswordRules.cs).
 * Mirroring the rules here lets users see translated warnings *before* submitting
 * instead of an opaque server error.
 */
export interface PasswordRule {
  /** Stable key for React lists. */
  key: string;
  /** Returns true when the password satisfies this rule. */
  test: (pwd: string) => boolean;
  /** Translated label shown in the live requirements checklist. */
  label: string;
}

export function getPasswordRules(t: Translations): PasswordRule[] {
  return [
    { key: 'len',    test: p => p.length >= 8,        label: t.pwdRuleLength },
    { key: 'upper',  test: p => /[A-Z]/.test(p),      label: t.pwdRuleUppercase },
    { key: 'lower',  test: p => /[a-z]/.test(p),      label: t.pwdRuleLowercase },
    { key: 'number', test: p => /[0-9]/.test(p),      label: t.pwdRuleNumber },
    { key: 'symbol', test: p => /[^A-Za-z0-9]/.test(p), label: t.pwdRuleSymbol },
  ];
}

/** First unmet rule's message, or undefined when the password is valid. */
export function firstPasswordError(pwd: string, t: Translations): string | undefined {
  return getPasswordRules(t).find(r => !r.test(pwd))?.label;
}
