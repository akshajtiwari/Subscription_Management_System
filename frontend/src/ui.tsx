import {
  cloneElement,
  isValidElement,
  useEffect,
  useId,
  useRef,
  useState,
  useLayoutEffect,
  type InputHTMLAttributes,
  type TextareaHTMLAttributes,
  type ReactElement,
  type ReactNode,
} from 'react';
import { Icon } from './Icon';

export const label = (value: string) =>
  value
    .replaceAll('_', ' ')
    .replaceAll('-', ' ')
    .replace(/^./, (c) => c.toUpperCase());
export const amount = (value: string | number = 0, currency = 'USD') => {
  const { minimumFractionDigits, maximumFractionDigits } = new Intl.NumberFormat('en', {
    style: 'currency',
    currency,
  }).resolvedOptions();
  return new Intl.NumberFormat('en', { minimumFractionDigits, maximumFractionDigits }).format(
    Number(value),
  );
};
export const day = (value?: string) =>
  value
    ? new Intl.DateTimeFormat('en-GB', {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        timeZone: 'UTC',
      }).format(new Date(value.length === 10 ? `${value}T00:00:00Z` : value))
    : '—';
export const today = () => {
  const value = new Date();
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
};

export function Dialog({
  title,
  onClose,
  children,
  wide = false,
  busy = false,
  variant = 'review',
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  busy?: boolean;
  variant?: 'review' | 'editor' | 'picker';
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const el = ref.current!;
    el.showModal();
    return () => el.close();
  }, []);
  return (
    <dialog
      ref={ref}
      id={
        variant === 'editor'
          ? 'editor-dialog'
          : variant === 'picker'
            ? 'product-picker'
            : 'review-dialog'
      }
      className={`dialog ${wide ? 'dialog-wide' : ''}`}
      aria-labelledby={id}
      aria-busy={busy}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <div
        className={
          variant === 'editor'
            ? 'editor-shell'
            : variant === 'picker'
              ? 'picker-shell'
              : 'review-shell'
        }
      >
        {variant === 'review' && (
          <div className="dialog-icon">
            <Icon name="receipt" />
          </div>
        )}
        <div
          className={
            variant === 'editor'
              ? 'editor-top'
              : variant === 'picker'
                ? 'picker-head'
                : 'dialog-head'
          }
        >
          <div>
            {variant === 'picker' && <div className="eyebrow">Product catalog</div>}
            <h2 id={id}>{title}</h2>
            {variant === 'picker' && (
              <p>Select products, then set quantities and taxes in the subscription.</p>
            )}
          </div>
          <button
            className="icon-btn"
            type="button"
            aria-label="Close dialog"
            disabled={busy}
            onClick={onClose}
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}

export function Field({
  name,
  error,
  children,
  wide = false,
}: {
  name: string;
  error?: string;
  children: ReactNode;
  wide?: boolean;
}) {
  const generatedId = useId();
  const control = isValidElement(children)
    ? (children as ReactElement<{
        id?: string;
        'aria-describedby'?: string;
        'aria-invalid'?: boolean;
      }>)
    : null;
  const id = control?.props.id || generatedId;
  const errorId = `${id}-error`;
  return (
    <div className={`field ${wide ? 'field-wide' : ''}`}>
      <label htmlFor={id}>{name}</label>
      {control
        ? cloneElement(control, {
            id,
            'aria-invalid': Boolean(error) || control.props['aria-invalid'],
            'aria-describedby': error ? errorId : control.props['aria-describedby'],
          })
        : children}
      {error && (
        <small id={errorId} className="field-error">
          {error}
        </small>
      )}
    </div>
  );
}

export function ErrorBox({ error, focus = false }: { error: string; focus?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (error && focus) ref.current?.focus();
  }, [error, focus]);
  return error ? (
    <div ref={ref} className="error-box" role="alert" tabIndex={-1}>
      {error}
    </div>
  ) : null;
}

export function Status({ value }: { value?: string }) {
  return (
    <span
      className={`pill status status-${value || 'active'} ${['overdue', 'rejected'].includes(value || '') ? 'warn' : ['draft', 'quotation', 'inactive', 'closed', 'canceled'].includes(value || '') ? 'neutral' : ''}`}
    >
      <i aria-hidden="true" />
      {label(value || 'active')}
    </span>
  );
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement>(null);
  function grow() {
    if (!ref.current) return;
    ref.current.style.height = 'auto';
    ref.current.style.height = `${ref.current.scrollHeight + 2}px`;
  }
  useLayoutEffect(grow, [props.value]);
  return (
    <textarea
      {...props}
      className={`resize-none ${props.className || ''}`}
      ref={ref}
      onInput={(event) => {
        grow();
        props.onInput?.(event);
      }}
    />
  );
}

export function SearchInput({
  value,
  onValueChange,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value' | 'type'> & {
  value: string;
  onValueChange: (value: string) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const composing = useRef(false);
  const [draft, setDraft] = useState(value);
  useEffect(() => {
    if (!composing.current) setDraft(value);
  }, [value]);
  return (
    <div className="search-control">
      <Icon name="search" />
      <input
        {...props}
        ref={ref}
        type="search"
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value);
          if (!composing.current) onValueChange(event.target.value);
        }}
        onCompositionStart={() => {
          composing.current = true;
        }}
        onCompositionEnd={(event) => {
          composing.current = false;
          onValueChange(event.currentTarget.value);
        }}
      />
      {draft && (
        <button
          className="clear-search"
          type="button"
          aria-label="Clear search"
          onClick={() => {
            composing.current = false;
            setDraft('');
            onValueChange('');
            ref.current?.focus();
          }}
        >
          <Icon name="close" />
        </button>
      )}
    </div>
  );
}

export function Empty({ children = 'No records found.' }: { children?: ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function Loading() {
  return (
    <div className="loading" role="status">
      <span className="spinner" aria-hidden="true" />
      Loading…
    </div>
  );
}
