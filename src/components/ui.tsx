import { forwardRef, useId, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react';
import { Check, LoaderCircle } from 'lucide-react';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  loading?: boolean;
  icon?: ReactNode;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', loading = false, icon, children, className = '', disabled, ...props }, ref,
) {
  return <button ref={ref} type="button" className={`nw-button nw-button--${variant} ${className}`} disabled={disabled || loading} aria-busy={loading || undefined} {...props}>
    {loading ? <LoaderCircle size={16} className="nw-spinner" aria-hidden="true" /> : icon}
    {children}
  </button>;
});

export function Badge({ tone = 'neutral', children }: { tone?: 'neutral' | 'success' | 'warning' | 'error'; children: ReactNode }) {
  return <span className={`nw-badge nw-badge--${tone}`}>{children}</span>;
}

export function Field({ label, hint, error, id, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string; error?: string }) {
  const generatedId = useId();
  const inputId = id || generatedId;
  return <div className="nw-field">
    <label htmlFor={inputId}>{label}</label>
    <input id={inputId} aria-invalid={!!error} aria-describedby={error || hint ? `${inputId}-hint` : undefined} {...props} />
    {(error || hint) && <span className={error ? 'nw-field-error' : 'nw-field-hint'} id={`${inputId}-hint`}>{error || hint}</span>}
  </div>;
}

export function Switch({ label, checked, onChange, description }: { label: string; checked: boolean; onChange: (checked: boolean) => void; description?: string }) {
  const id = useId();
  return <div className="nw-switch-row">
    <div><label htmlFor={id}>{label}</label>{description && <p id={`${id}-hint`}>{description}</p>}</div>
    <button id={id} type="button" className="nw-switch" role="switch" aria-checked={checked} aria-describedby={description ? `${id}-hint` : undefined} onClick={() => onChange(!checked)}>
      <span>{checked && <Check size={12} aria-hidden="true" />}</span>
    </button>
  </div>;
}
