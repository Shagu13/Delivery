import type { InputHTMLAttributes } from 'react';

/**
 * Reduce any pasted/typed string to the 9-digit Georgian local mobile number
 * (always `5XXXXXXXX`). Strips whitespace, dashes, dots, brackets, the `+995`
 * country code, and any domestic trunk zero — e.g. `+995 599-23-44-55` or
 * `599 23 44 55` both become `599234455`.
 */
export function sanitizeGeorgianMobile(raw: string): string {
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('995')) digits = digits.slice(3); // drop +995 country code
  digits = digits.replace(/^0+/, '');                     // drop domestic trunk zero(s)
  return digits.slice(0, 9);
}

/** A complete Georgian mobile number is exactly 9 digits and starts with 5. */
export function isValidGeorgianMobile(v: string): boolean {
  return /^5\d{8}$/.test(v);
}

interface GeorgianPhoneFieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value' | 'type'> {
  label: string;
  required?: boolean;
  /** The stored 9-digit local number (no prefix). */
  value: string;
  /** Called with the sanitized 9-digit local number on every edit/paste. */
  onValueChange: (value: string) => void;
  /** External error (e.g. "required" from form submit) — takes priority. */
  error?: string;
  /** Live error shown while the value is non-empty but not a valid number. */
  invalidMessage?: string;
}

/**
 * Phone input that renders a fixed `+995` prefix and keeps only a clean
 * 9-digit local number in state. Turns red when the parent reports an error
 * or when the current value is non-empty and not a valid mobile number.
 */
export function GeorgianPhoneField({
  label,
  required,
  value,
  onValueChange,
  error,
  invalidMessage,
  ...rest
}: GeorgianPhoneFieldProps) {
  const formatError =
    !error && value.length > 0 && !isValidGeorgianMobile(value) ? invalidMessage : undefined;
  const shownError = error ?? formatError;

  return (
    <div className={`form-field ${shownError ? 'form-field--error' : ''}`}>
      <label className="form-field__label">
        {label}
        {required && <span className="form-field__required">*</span>}
      </label>
      <div className="phone-field">
        <span className="phone-field__prefix" aria-hidden="true">+995</span>
        <input
          {...rest}
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          className="form-field__input phone-field__input"
          value={value}
          onChange={e => onValueChange(sanitizeGeorgianMobile(e.target.value))}
          placeholder="5XXXXXXXX"
        />
      </div>
      {shownError && <span className="form-field__error">{shownError}</span>}
    </div>
  );
}
