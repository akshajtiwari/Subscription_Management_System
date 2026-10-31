import { useEffect, useState } from 'react';
import { request, type Row } from './api';
import { Dialog, Empty, ErrorBox, Field, Loading, SearchInput, amount } from './ui';

export const catalogKey = (row: Row) => `${row.product_id}:${row.variant_id ?? 'base'}`;

export function CatalogPicker({
  token,
  currency,
  baseOnly = false,
  single = false,
  selected = [],
  onApply,
  onClose,
}: {
  token: string;
  currency?: string;
  baseOnly?: boolean;
  single?: boolean;
  selected?: Row[];
  onApply: (rows: Row[]) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [chosen, setChosen] = useState(new Map(selected.map((row) => [catalogKey(row), row])));
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(
      () => {
        setBusy(true);
        setError('');
        request(`catalog-items?search=${encodeURIComponent(search)}`, token, {
          signal: controller.signal,
        })
          .then((result) =>
            setRows(
              result.data.filter(
                (row: Row) =>
                  (!currency || row.currency === currency) &&
                  (!baseOnly || row.variant_id === null),
              ),
            ),
          )
          .catch((cause) => {
            if (cause.name !== 'AbortError') setError(cause.message);
          })
          .finally(() => {
            if (!controller.signal.aborted) setBusy(false);
          });
      },
      search ? 300 : 0,
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [search, token, currency, baseOnly]);
  function toggle(row: Row) {
    const next = single ? new Map<string, Row>() : new Map(chosen);
    if (chosen.has(catalogKey(row))) next.delete(catalogKey(row));
    else next.set(catalogKey(row), row);
    setChosen(next);
  }
  return (
    <Dialog title="Add product lines" onClose={onClose} wide variant="picker">
      <div className="picker-search">
        <Field name="Search products">
          <SearchInput
            value={search}
            onValueChange={setSearch}
            placeholder="Name, SKU, or variant"
            autoFocus
          />
        </Field>
      </div>
      <ErrorBox error={error} />
      {busy && <Loading />}
      <p className="picker-result" aria-live="polite">
        {rows.length} products
      </p>
      <div className="picker-tablewrap">
        <table>
          <thead>
            <tr>
              <th>Select</th>
              <th>Product</th>
              <th>Variant</th>
              <th className="numeric">Unit price</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={catalogKey(row)}>
                <td>
                  <input
                    type={single ? 'radio' : 'checkbox'}
                    name="catalog-selection"
                    aria-label={`Select ${row.name}${row.variant_name ? ` ${row.variant_name}` : ''}`}
                    checked={chosen.has(catalogKey(row))}
                    onChange={() => toggle(row)}
                  />
                </td>
                <td>
                  <strong>{row.name}</strong>
                  <small>{row.sku || '—'}</small>
                </td>
                <td>{row.variant_name || 'Base product'}</td>
                <td className="numeric">{amount(row.unit_price, row.currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!busy && !rows.length && <Empty>No products match your search.</Empty>}
      </div>
      <div className="picker-footer">
        <span>{chosen.size} selected</span>
        <button className="btn" type="button" onClick={onClose}>
          Cancel
        </button>
        <button
          className="btn primary"
          type="button"
          disabled={!chosen.size}
          onClick={() => onApply([...chosen.values()])}
        >
          Add selected
        </button>
      </div>
    </Dialog>
  );
}
