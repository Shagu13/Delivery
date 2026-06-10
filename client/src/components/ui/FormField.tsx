import { useState } from 'react';
import type { InputHTMLAttributes, TextareaHTMLAttributes } from 'react';

interface BaseProps {
  label: string;
  error?: string;
  required?: boolean;
}

interface InputProps extends BaseProps, InputHTMLAttributes<HTMLInputElement> {
  as?: 'input';
}

interface TextareaProps extends BaseProps, TextareaHTMLAttributes<HTMLTextAreaElement> {
  as: 'textarea';
}

type FormFieldProps = InputProps | TextareaProps;

export function FormField(props: FormFieldProps) {
  const { label, error, required, as = 'input', ...rest } = props;
  const [revealed, setRevealed] = useState(false);

  const inputRest = rest as InputHTMLAttributes<HTMLInputElement>;
  const isPassword = as !== 'textarea' && inputRest.type === 'password';

  return (
    <div className={`form-field ${error ? 'form-field--error' : ''}`}>
      <label className="form-field__label">
        {label}
        {required && <span className="form-field__required">*</span>}
      </label>
      {as === 'textarea' ? (
        <textarea
          className="form-field__input form-field__textarea"
          {...(rest as TextareaHTMLAttributes<HTMLTextAreaElement>)}
        />
      ) : isPassword ? (
        <div className="form-field__password">
          <input
            {...inputRest}
            type={revealed ? 'text' : 'password'}
            className="form-field__input form-field__input--password"
          />
          <button
            type="button"
            className="form-field__reveal"
            onClick={() => setRevealed(v => !v)}
            aria-label={revealed ? 'Hide password' : 'Show password'}
            aria-pressed={revealed}
            tabIndex={-1}
          >
            {revealed ? (
              <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
                <path d="M2 2l16 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <path d="M8.5 8.6a2 2 0 002.8 2.8M6 6.3C4.1 7.4 2.7 9 2 10c1.5 2.4 4.4 5 8 5 1.4 0 2.7-.4 3.8-1M16.5 13.2C17.4 12.3 18.3 11.2 18 10c-1.5-2.4-4.4-5-8-5-.5 0-1 .05-1.5.15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
                <path d="M2 10c1.5-2.4 4.4-5 8-5s6.5 2.6 8 5c-1.5 2.4-4.4 5-8 5s-6.5-2.6-8-5z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                <circle cx="10" cy="10" r="2.2" stroke="currentColor" strokeWidth="1.5" />
              </svg>
            )}
          </button>
        </div>
      ) : (
        <input
          className="form-field__input"
          {...inputRest}
        />
      )}
      {error && <span className="form-field__error">{error}</span>}
    </div>
  );
}
