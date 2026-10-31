import { useEffect, useId, useRef, type ReactNode } from 'react';

export const label = (value: string) =>
  value
    .replaceAll('_', ' ')
    .replaceAll('-', ' ')
    .replace(/^./, (c) => c.toUpperCase());
export const amount = (value: string | number = 0, currency = 'USD') =>
  new Intl.NumberFormat('en', { style: 'currency', currency }).format(Number(value));
export const day = (value?: string) =>
  value
    ? new Intl.DateTimeFormat('en', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC',
      }).format(new Date(value.length === 10 ? `${value}T00:00:00Z` : value))
    : '—';
export const today = () => new Date().toISOString().slice(0, 10);

export function Dialog({
  title,
  onClose,
  children,
  wide = false,
  busy = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  busy?: boolean;
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
      className={`dialog ${wide ? 'dialog-wide' : ''}`}
      aria-labelledby={id}
      aria-busy={busy}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <div className="dialog-head">
        <h2 id={id}>{title}</h2>
        <button
          className="icon-button"
          type="button"
          aria-label="Close dialog"
          disabled={busy}
          onClick={onClose}
        >
          ×
        </button>
      </div>
      {children}
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
  return (
    <label className={`field ${wide ? 'field-wide' : ''}`}>
      <span>{name}</span>
      {children}
      {error && <small className="field-error">{error}</small>}
    </label>
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
    <span className={`status status-${value || 'active'}`}>
      <i aria-hidden="true" />
      {label(value || 'active')}
    </span>
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
