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
      ) : (
        <input
          className="form-field__input"
          {...(rest as InputHTMLAttributes<HTMLInputElement>)}
        />
      )}
      {error && <span className="form-field__error">{error}</span>}
    </div>
  );
}
